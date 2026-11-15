const { WebhookEventModel } = require("../model/WebhookEventModel");
const { PaymentModel } = require("../model/PaymentModel");
const {
  verifyWebhookSignature,
  getRazorpayCredentials,
} = require("../config/razorpay");
const { acquireUserLock, releaseUserLock } = require("./orderExecutionService");
const { processCapturedPayment } = require("./paymentProcessingService");
const { handleRefundWebhookEvent } = require("./paymentRefundService");
const { logWebhook } = require("../util/webhookLogger");

const MAX_EVENT_RETRIES = 5;

/**
 * Validates and extracts payload from raw webhook request.
 */
const parseWebhookPayload = (rawBody) => {
  if (!rawBody) {
    return null;
  }
  try {
    const stringBody = Buffer.isBuffer(rawBody)
      ? rawBody.toString("utf8")
      : String(rawBody);
    return JSON.parse(stringBody);
  } catch (err) {
    return null;
  }
};

/**
 * Processes a single claimed webhook event.
 *
 * @param {string} eventDocId - MongoDB ObjectId of the WebhookEvent document
 * @returns {Promise<Object>} Processing outcome
 */
const processWebhookEventById = async (eventDocId) => {
  // 1. Atomically claim event to ensure only one worker/call processes it
  const event = await WebhookEventModel.findOneAndUpdate(
    {
      _id: eventDocId,
      processingStatus: { $in: ["RECEIVED", "PROCESSING"] },
    },
    {
      $set: {
        processingStatus: "PROCESSING",
        status: "PROCESSING",
        processingStartedAt: new Date(),
        updatedAt: new Date(),
      },
      $inc: { retryCount: 1 },
    },
    { returnDocument: "after" }
  );

  if (!event) {
    return { skipped: true, reason: "Event already processed or claimed by another worker." };
  }

  const { eventType, razorpayOrderId, razorpayPaymentId, razorpayRefundId, payload } = event;

  logWebhook({
    level: "info",
    stage: eventType.startsWith("refund.")
      ? "refund_processing"
      : eventType.startsWith("order.")
      ? "order_processing"
      : "payment_processing",
    eventId: event.razorpayEventId,
    eventType,
    paymentId: razorpayPaymentId,
    refundId: razorpayRefundId,
    status: "PROCESSING",
    message: `Processing started for webhook event '${eventType}' (${event.razorpayEventId}).`,
  });

  try {
    let internalPayment = null;

    // A. Handle Payment Events (authorized, captured, failed)
    if (eventType.startsWith("payment.")) {
      if (razorpayOrderId) {
        internalPayment = await PaymentModel.findOne({ razorpayOrderId });
      } else if (razorpayPaymentId) {
        internalPayment = await PaymentModel.findOne({ razorpayPaymentId });
      }

      if (internalPayment) {
        const userId = internalPayment.userId;
        await acquireUserLock(userId);

        try {
          // Re-fetch under user lock
          const lockedPayment = await PaymentModel.findOne({
            _id: internalPayment._id,
          });

          if (lockedPayment) {
            // A1. payment.captured
            if (eventType === "payment.captured") {
              const expectedAmount = lockedPayment.amount;
              const actualAmount = payload?.amount;
              const expectedCurrency = (lockedPayment.currency || "INR").toUpperCase();
              const actualCurrency = (payload?.currency || "INR").toUpperCase();

              // Validate amount & currency
              if (actualAmount !== undefined && Number(actualAmount) !== Number(expectedAmount)) {
                throw new Error(
                  `Payment amount mismatch: expected ${expectedAmount} paise, received ${actualAmount} paise.`
                );
              }

              if (actualCurrency !== expectedCurrency) {
                throw new Error(
                  `Payment currency mismatch: expected ${expectedCurrency}, received ${actualCurrency}.`
                );
              }

              // State transitions: CREATED or PENDING -> CAPTURED
              if (
                lockedPayment.status === "CREATED" ||
                lockedPayment.status === "PENDING"
              ) {
                lockedPayment.status = "CAPTURED";
                lockedPayment.razorpayPaymentId =
                  razorpayPaymentId || lockedPayment.razorpayPaymentId;
                lockedPayment.capturedAt = new Date();
                lockedPayment.updatedAt = new Date();
                await lockedPayment.save();

                logWebhook({
                  level: "info",
                  stage: "payment_status_update",
                  eventId: event.razorpayEventId,
                  eventType,
                  paymentId: lockedPayment.internalPaymentId,
                  status: "CAPTURED",
                  message: `Payment '${lockedPayment.internalPaymentId}' status updated to CAPTURED.`,
                });
              }
              // If already CAPTURED or CREDITED: idempotent no-op
            }

            // A2. payment.authorized
            else if (eventType === "payment.authorized") {
              // Only transition if currently in CREATED state.
              // Never downgrade CAPTURED or CREDITED to PENDING.
              if (lockedPayment.status === "CREATED") {
                lockedPayment.status = "PENDING";
                lockedPayment.razorpayPaymentId =
                  razorpayPaymentId || lockedPayment.razorpayPaymentId;
                lockedPayment.updatedAt = new Date();
                await lockedPayment.save();

                logWebhook({
                  level: "info",
                  stage: "payment_status_update",
                  eventId: event.razorpayEventId,
                  eventType,
                  paymentId: lockedPayment.internalPaymentId,
                  status: "PENDING",
                  message: `Payment '${lockedPayment.internalPaymentId}' status updated to PENDING (authorized).`,
                });
              }
            }

            // A3. payment.failed
            else if (eventType === "payment.failed") {
              // Only mark FAILED if currently CREATED or PENDING.
              // Never downgrade CAPTURED or CREDITED to FAILED!
              if (
                lockedPayment.status === "CREATED" ||
                lockedPayment.status === "PENDING"
              ) {
                lockedPayment.status = "FAILED";
                lockedPayment.razorpayPaymentId =
                  razorpayPaymentId || lockedPayment.razorpayPaymentId;
                lockedPayment.failureReason =
                  payload?.notes?.error_description ||
                  payload?.status ||
                  "Payment failed at payment gateway.";
                lockedPayment.updatedAt = new Date();
                await lockedPayment.save();

                logWebhook({
                  level: "warn",
                  stage: "payment_status_update",
                  eventId: event.razorpayEventId,
                  eventType,
                  paymentId: lockedPayment.internalPaymentId,
                  status: "FAILED",
                  message: `Payment '${lockedPayment.internalPaymentId}' status updated to FAILED.`,
                });
              }
            }
          }
        } finally {
          releaseUserLock(userId);
        }

        // Authoritative central wallet crediting for captured payments
        if (eventType === "payment.captured") {
          logWebhook({
            level: "info",
            stage: "wallet_crediting",
            eventId: event.razorpayEventId,
            eventType,
            paymentId: internalPayment.internalPaymentId,
            status: "PROCESSING",
            message: `Wallet crediting started for captured payment '${internalPayment.internalPaymentId}'.`,
          });

          await processCapturedPayment({
            internalPaymentId: internalPayment.internalPaymentId,
            razorpayPaymentId: razorpayPaymentId || internalPayment.razorpayPaymentId,
          });

          logWebhook({
            level: "info",
            stage: "wallet_crediting",
            eventId: event.razorpayEventId,
            eventType,
            paymentId: internalPayment.internalPaymentId,
            status: "CREDITED",
            message: `Wallet crediting successfully committed for payment '${internalPayment.internalPaymentId}' (+₹${internalPayment.amount / 100}).`,
          });
        }
      } else {
        // Payment record not immediately found; might arrive before frontend order creation finishes
        throw new Error(
          `Internal payment record not found for order '${razorpayOrderId}'.`
        );
      }
    }

    // B. Handle Order Events (order.paid)
    else if (eventType === "order.paid") {
      if (razorpayOrderId) {
        internalPayment = await PaymentModel.findOne({ razorpayOrderId });
      }

      if (internalPayment) {
        const userId = internalPayment.userId;
        await acquireUserLock(userId);

        try {
          const lockedPayment = await PaymentModel.findOne({
            _id: internalPayment._id,
          });

          if (
            lockedPayment &&
            (lockedPayment.status === "CREATED" ||
              lockedPayment.status === "PENDING")
          ) {
            lockedPayment.status = "CAPTURED";
            if (razorpayPaymentId && !lockedPayment.razorpayPaymentId) {
              lockedPayment.razorpayPaymentId = razorpayPaymentId;
            }
            lockedPayment.capturedAt = new Date();
            lockedPayment.updatedAt = new Date();
            await lockedPayment.save();

            logWebhook({
              level: "info",
              stage: "payment_status_update",
              eventId: event.razorpayEventId,
              eventType,
              paymentId: lockedPayment.internalPaymentId,
              status: "CAPTURED",
              message: `Order '${razorpayOrderId}' payment marked CAPTURED.`,
            });
          }
        } finally {
          releaseUserLock(userId);
        }

        // Authoritative central wallet crediting for paid orders
        logWebhook({
          level: "info",
          stage: "wallet_crediting",
          eventId: event.razorpayEventId,
          eventType,
          paymentId: internalPayment.internalPaymentId,
          status: "PROCESSING",
          message: `Wallet crediting started for paid order '${razorpayOrderId}'.`,
        });

        await processCapturedPayment({
          internalPaymentId: internalPayment.internalPaymentId,
          razorpayPaymentId: razorpayPaymentId || internalPayment.razorpayPaymentId,
        });

        logWebhook({
          level: "info",
          stage: "wallet_crediting",
          eventId: event.razorpayEventId,
          eventType,
          paymentId: internalPayment.internalPaymentId,
          status: "CREDITED",
          message: `Wallet crediting successfully committed for order '${razorpayOrderId}'.`,
        });
      } else {
        throw new Error(
          `Internal payment record not found for order '${razorpayOrderId}'.`
        );
      }
    }

    // C. Handle Refund Events (refund.processed, refund.failed)
    else if (eventType.startsWith("refund.")) {
      const refundEntity =
        event.payload?.refund ||
        (event.payload?.entityId?.startsWith("rfnd_")
          ? {
              id: event.payload.entityId,
              payment_id: razorpayPaymentId,
              amount: event.payload.amount,
              currency: event.payload.currency,
              status: event.payload.status,
            }
          : null);

      logWebhook({
        level: "info",
        stage: "refund_received",
        eventId: event.razorpayEventId,
        eventType,
        refundId: refundEntity?.id || razorpayRefundId,
        paymentId: razorpayPaymentId,
        message: `Refund webhook received: ${eventType} (${refundEntity?.id || razorpayRefundId || event.razorpayEventId}).`,
      });

      if (refundEntity) {
        await handleRefundWebhookEvent({
          eventType,
          refundEntity,
          paymentEntity: event.payload?.payment || null,
          eventId: event.razorpayEventId,
        });
      }
    }

    // D. Mark event PROCESSED
    event.processingStatus = "PROCESSED";
    event.status = "PROCESSED";
    event.processedAt = new Date();
    event.internalPaymentId = internalPayment?.internalPaymentId || null;
    event.lastError = null;
    event.errorDetails = null;
    await event.save();

    logWebhook({
      level: "info",
      stage: "event_completed",
      eventId: event.razorpayEventId,
      eventType: event.eventType,
      paymentId: event.razorpayPaymentId,
      refundId: event.razorpayRefundId,
      status: "PROCESSED",
      message: `Webhook event '${event.razorpayEventId}' successfully processed and marked PROCESSED in MongoDB.`,
    });

    return { success: true, eventId: event.razorpayEventId };
  } catch (err) {
    const isFinalFailure = event.retryCount >= MAX_EVENT_RETRIES;
    event.processingStatus = isFinalFailure ? "FAILED" : "RECEIVED";
    event.status = event.processingStatus;
    event.lastError = err.message;
    event.errorDetails = err.message;
    await event.save();

    logWebhook({
      level: "error",
      stage: "event_processing",
      eventId: event.razorpayEventId,
      eventType: event.eventType,
      paymentId: event.razorpayPaymentId,
      refundId: event.razorpayRefundId,
      status: isFinalFailure ? "FAILED" : "RECEIVED",
      errorCode: "PROCESSING_ERROR",
      error: err,
      message: `Webhook event processing error for '${event.razorpayEventId}': ${err.message}`,
    });

    return { success: false, error: err.message, retryScheduled: !isFinalFailure };
  }
};

/**
 * Receives, authenticates, persists, and coordinates processing of an incoming webhook.
 *
 * @param {Object} params
 * @param {Buffer|string} params.rawBody - Raw unmodified request body
 * @param {string} params.signature - Value from 'x-razorpay-signature' header
 * @param {string} params.eventIdHeader - Value from 'x-razorpay-event-id' header
 * @param {string} [params.customWebhookSecret] - Optional secret override for test isolation
 * @returns {Promise<Object>} Receipt and processing summary
 */
const receiveAndProcessWebhook = async ({
  rawBody,
  signature,
  eventIdHeader,
  customWebhookSecret = null,
}) => {
  const { webhookSecret } = getRazorpayCredentials();
  const activeSecret = customWebhookSecret || webhookSecret;

  // 1. Verify webhook configuration
  if (!activeSecret) {
    logWebhook({
      level: "error",
      stage: "request_validation",
      eventId: eventIdHeader || undefined,
      errorCode: "MISSING_CONFIG",
      message: "Webhook secret is not configured on the server.",
    });
    const error = new Error("Webhook secret is not configured on the server.");
    error.statusCode = 500;
    throw error;
  }

  // 2. Validate presence of signature
  if (!signature) {
    logWebhook({
      level: "error",
      stage: "request_validation",
      eventId: eventIdHeader || undefined,
      errorCode: "MISSING_SIGNATURE",
      message: "Missing x-razorpay-signature header.",
    });
    const error = new Error("Missing x-razorpay-signature header.");
    error.statusCode = 400;
    throw error;
  }

  // 3. Verify cryptographic webhook signature (HMAC-SHA256 of raw body)
  const isSignatureValid = verifyWebhookSignature({
    rawBody,
    signature,
    customWebhookSecret: activeSecret,
  });

  if (!isSignatureValid) {
    logWebhook({
      level: "error",
      stage: "signature_verification",
      eventId: eventIdHeader || undefined,
      errorCode: "INVALID_SIGNATURE",
      message: "Webhook signature verification failed: cryptographic signature mismatch.",
    });
    const error = new Error("Invalid webhook signature.");
    error.statusCode = 400;
    throw error;
  }

  logWebhook({
    level: "info",
    stage: "signature_verification",
    eventId: eventIdHeader || undefined,
    message: "Webhook signature verification successful.",
  });

  // 4. Validate presence of event ID
  if (!eventIdHeader || typeof eventIdHeader !== "string" || eventIdHeader.trim().length === 0) {
    logWebhook({
      level: "error",
      stage: "request_validation",
      errorCode: "MISSING_EVENT_ID",
      message: "Missing x-razorpay-event-id header.",
    });
    const error = new Error("Missing x-razorpay-event-id header.");
    error.statusCode = 400;
    throw error;
  }

  const razorpayEventId = eventIdHeader.trim();

  // 5. Parse and validate JSON payload
  const parsedPayload = parseWebhookPayload(rawBody);
  if (!parsedPayload || typeof parsedPayload !== "object") {
    logWebhook({
      level: "error",
      stage: "request_validation",
      eventId: razorpayEventId,
      errorCode: "MALFORMED_PAYLOAD",
      message: "Malformed webhook payload: invalid JSON format.",
    });
    const error = new Error("Malformed webhook payload: invalid JSON format.");
    error.statusCode = 400;
    throw error;
  }

  const eventType = parsedPayload.event;
  if (!eventType || typeof eventType !== "string") {
    logWebhook({
      level: "error",
      stage: "request_validation",
      eventId: razorpayEventId,
      errorCode: "MISSING_EVENT_TYPE",
      message: "Malformed webhook payload: missing event type.",
    });
    const error = new Error("Malformed webhook payload: missing event type.");
    error.statusCode = 400;
    throw error;
  }

  // Extract relevant entities
  const paymentEntity = parsedPayload.payload?.payment?.entity || null;
  const orderEntity = parsedPayload.payload?.order?.entity || null;
  const refundEntity = parsedPayload.payload?.refund?.entity || null;

  const razorpayOrderId =
    paymentEntity?.order_id || orderEntity?.id || null;
  const razorpayPaymentId =
    paymentEntity?.id || refundEntity?.payment_id || null;
  const razorpayRefundId =
    refundEntity?.id || (eventType.startsWith("refund.") ? parsedPayload.payload?.entityId : null) || null;
  const internalRefundId =
    refundEntity?.notes?.internalRefundId || refundEntity?.receipt || null;

  logWebhook({
    level: "info",
    stage: "payload_parsed",
    eventId: razorpayEventId,
    eventType,
    paymentId: razorpayPaymentId,
    refundId: razorpayRefundId,
    message: `Webhook payload parsed for event '${eventType}' (${razorpayEventId}).`,
  });

  // 6. Check for duplicate event (idempotency protection)
  const existingEvent = await WebhookEventModel.findOne({ razorpayEventId });
  if (existingEvent) {
    logWebhook({
      level: "warn",
      stage: "duplicate_detection",
      eventId: razorpayEventId,
      eventType,
      paymentId: razorpayPaymentId,
      refundId: razorpayRefundId,
      status: existingEvent.processingStatus,
      message: `Duplicate webhook event '${razorpayEventId}' detected. Skipping redundant execution.`,
    });
    return {
      received: true,
      isDuplicate: true,
      message: "Duplicate webhook event already recorded.",
      eventId: razorpayEventId,
      status: existingEvent.processingStatus,
    };
  }

  // 7. Durably persist event with status RECEIVED
  let webhookDoc;
  try {
    webhookDoc = await WebhookEventModel.create({
      razorpayEventId,
      eventId: razorpayEventId,
      eventType,
      razorpayOrderId,
      razorpayPaymentId,
      razorpayRefundId,
      internalRefundId,
      signatureVerified: true,
      processingStatus: "RECEIVED",
      status: "RECEIVED",
      isDuplicate: false,
      payload: {
        event: eventType,
        entityId: paymentEntity?.id || orderEntity?.id || refundEntity?.id,
        amount:
          paymentEntity?.amount ||
          orderEntity?.amount_paid ||
          refundEntity?.amount,
        currency:
          paymentEntity?.currency ||
          orderEntity?.currency ||
          refundEntity?.currency,
        status:
          paymentEntity?.status ||
          orderEntity?.status ||
          refundEntity?.status,
        notes:
          paymentEntity?.notes ||
          orderEntity?.notes ||
          refundEntity?.notes,
        refund: refundEntity
          ? {
              id: refundEntity.id,
              payment_id: refundEntity.payment_id,
              amount: refundEntity.amount,
              currency: refundEntity.currency,
              status: refundEntity.status,
              speed_processed: refundEntity.speed_processed,
            }
          : null,
        payment: paymentEntity
          ? {
              id: paymentEntity.id,
              order_id: paymentEntity.order_id,
              amount: paymentEntity.amount,
              currency: paymentEntity.currency,
              status: paymentEntity.status,
              method: paymentEntity.method,
            }
          : null,
      },
    });

    logWebhook({
      level: "info",
      stage: "event_persistence",
      eventId: razorpayEventId,
      eventType,
      paymentId: razorpayPaymentId,
      refundId: razorpayRefundId,
      status: "RECEIVED",
      message: `Webhook event '${razorpayEventId}' successfully persisted to MongoDB.`,
    });
  } catch (err) {
    if (err.code === 11000) {
      // Caught concurrent duplicate delivery via unique index
      logWebhook({
        level: "warn",
        stage: "duplicate_detection",
        eventId: razorpayEventId,
        eventType,
        paymentId: razorpayPaymentId,
        refundId: razorpayRefundId,
        status: "DUPLICATE",
        message: `Concurrent duplicate webhook event '${razorpayEventId}' detected via unique constraint.`,
      });
      const duplicate = await WebhookEventModel.findOne({ razorpayEventId });
      return {
        received: true,
        isDuplicate: true,
        message: "Duplicate webhook event detected via unique constraint.",
        eventId: razorpayEventId,
        status: duplicate?.processingStatus || "RECEIVED",
      };
    }

    logWebhook({
      level: "error",
      stage: "event_persistence",
      eventId: razorpayEventId,
      eventType,
      errorCode: "DB_PERSISTENCE_FAILED",
      error: err,
      message: `Database persistence failure for webhook event '${razorpayEventId}': ${err.message}`,
    });

    const error = new Error("Failed to durably record webhook event.");
    error.statusCode = 500;
    throw error;
  }

  // 8. Process the recorded event immediately
  const processingResult = await processWebhookEventById(webhookDoc._id);

  return {
    received: true,
    isDuplicate: false,
    message: "Webhook event received and processed successfully.",
    eventId: razorpayEventId,
    eventType,
    processingResult,
  };
};

/**
 * Background recovery worker to process pending or interrupted events.
 * Safe to run after server restarts or network blips.
 */
const recoverStaleWebhookEvents = async ({ maxBatch = 50, staleMinutes = 5 } = {}) => {
  const staleThreshold = new Date(Date.now() - staleMinutes * 60 * 1000);

  const pendingEvents = await WebhookEventModel.find({
    $or: [
      { processingStatus: "RECEIVED", retryCount: { $lt: MAX_EVENT_RETRIES } },
      {
        processingStatus: "PROCESSING",
        updatedAt: { $lt: staleThreshold },
        retryCount: { $lt: MAX_EVENT_RETRIES },
      },
    ],
  })
    .sort({ receivedAt: 1 })
    .limit(maxBatch);

  const results = [];
  for (const event of pendingEvents) {
    const outcome = await processWebhookEventById(event._id);
    results.push({ eventId: event.razorpayEventId, outcome });
  }

  return results;
};

module.exports = {
  receiveAndProcessWebhook,
  processWebhookEventById,
  recoverStaleWebhookEvents,
  parseWebhookPayload,
  logWebhook,
  MAX_EVENT_RETRIES,
};
