const crypto = require("crypto");
const mongoose = require("mongoose");
const { PaymentModel } = require("../model/PaymentModel");
const { FundsModel } = require("../model/FundsModel");
const { WalletTransactionModel } = require("../model/WalletTransactionModel");
const { RefundModel } = require("../model/RefundModel");
const { razorpayClient } = require("../config/razorpay");
const { acquireUserLock, releaseUserLock } = require("./orderExecutionService");
const { notifyUserFundsUpdated } = require("./socketService");
const { logWebhook } = require("../util/webhookLogger");

/**
 * Payment Refund Service
 *
 * Responsibilities:
 * 1. Initiates authorized partial or full refunds via Razorpay Node SDK.
 * 2. Strict authorization & ownership validation (rejects cross-user access).
 * 3. Multi-Instance Idempotency:
 *    - Enforces database-level unique compound index on { paymentId, idempotencyKey }
 *      in dedicated RefundModel to prevent duplicate gateway refunds across multiple Node instances.
 *    - Creates durable PENDING refund record before issuing gateway API call.
 * 4. Safe Conditional Wallet Accounting:
 *    - Uses conditional atomic update with {$gte} to verify sufficient funds before debiting.
 *    - Prevents race conditions with stock order execution or concurrent operations.
 *    - Explicitly records wallet reversal status: DEDUCTED, INSUFFICIENT_FUNDS, UNTOUCHED, or SKIPPED_UNCREDITED.
 *    - Never pushes simulated wallet balance into a deficit / negative margin.
 * 5. Authoritative Webhook Handling:
 *    - Strictly validates refund amount as positive integer in paise.
 *    - Resolves missing/invalid amounts only from authoritative existing records.
 *    - Quarantines/rejects malformed webhooks without inventing monetary values (no 100 paise fallback).
 * 6. Durable Recovery & Reconciliation:
 *    - Reconciles in-flight PENDING refunds against Razorpay without issuing duplicate refunds.
 */

/**
 * Generates an internal refund identifier (RFND_...)
 */
const generateInternalRefundId = () => {
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `RFND_${timestamp}_${randomSuffix}`;
};

/**
 * Detects whether the active MongoDB deployment supports replica-set transactions.
 */
const isTransactionSupported = () => {
  try {
    const topo = mongoose.connection?.client?.topology;
    const descType = topo?.description?.type || "";
    return (
      descType.includes("ReplicaSet") ||
      descType === "Sharded" ||
      Boolean(topo?.description?.setName)
    );
  } catch (e) {
    return false;
  }
};

/**
 * Distinguishes authoritative gateway rejections (e.g. 400 Bad Request, 422 Unprocessable)
 * from uncertain network outcomes (e.g. timeouts, 502/503/504, connection reset).
 */
const isDefiniteGatewayRejection = (err) => {
  const statusCode = err?.statusCode || err?.status;
  const code = err?.code || "";
  const msg = String(err?.message || "").toLowerCase();

  // If network error, timeout, or ambiguous 5xx, outcome is UNCERTAIN
  if (
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("socket hang up") ||
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode >= 500
  ) {
    return false;
  }

  // 4xx status codes (except 408 timeout & 429 rate-limit) represent authoritative gateway rejection
  if (statusCode >= 400 && statusCode < 500) {
    return true;
  }

  return false;
};

/**
 * Helper to format duplicate idempotent refund response
 */
const formatDuplicateRefundResponse = (refundRecord, paymentDoc) => {
  const isReconciled =
    refundRecord.walletDeductionStatus === "DEDUCTED" ||
    refundRecord.walletDeductionStatus === "SKIPPED_UNCREDITED";

  return {
    success: true,
    isDuplicate: true,
    message: "Refund with this idempotency key has already been processed.",
    reconciled: isReconciled,
    gatewayRefund: {
      id: refundRecord.razorpayRefundId,
      status: refundRecord.status,
      amountPaise: refundRecord.amount,
      amountRupees: refundRecord.amountRupees || refundRecord.amount / 100,
      currency: refundRecord.currency || "INR",
    },
    walletReversal: {
      status: refundRecord.walletDeductionStatus,
      walletTransactionId: refundRecord.walletTransactionId || null,
      notes: refundRecord.walletReversalNotes || null,
    },
    refund: {
      refundId: refundRecord.refundId,
      razorpayRefundId: refundRecord.razorpayRefundId,
      amountPaise: refundRecord.amount,
      amountRupees: refundRecord.amountRupees || refundRecord.amount / 100,
      status: refundRecord.status,
      refundStatus: paymentDoc.refundStatus,
      walletDeductionStatus: refundRecord.walletDeductionStatus,
      reconciled: isReconciled,
      createdAt: refundRecord.createdAt,
    },
  };
};

/**
 * Initiates an authorized refund for a payment.
 *
 * @param {Object} params
 * @param {string} params.userId - Authenticated user ID
 * @param {string} params.paymentIdentifier - internalPaymentId, razorpayOrderId, or razorpayPaymentId
 * @param {number} [params.amount] - Refund amount in integer paise (omit for full remaining refund)
 * @param {string} [params.reason] - Stated reason for refund
 * @param {string} [params.idempotencyKey] - Client idempotency key
 * @param {boolean} [params.deductFromWallet=false] - Whether to attempt a safe wallet debit
 * @param {Object} [params.clientOverride] - Razorpay client override (for testing/mocking)
 * @returns {Promise<Object>} Refund outcome
 */
const initiatePaymentRefund = async ({
  userId,
  paymentIdentifier,
  amount = null,
  reason = null,
  idempotencyKey = null,
  deductFromWallet = false,
  clientOverride = null,
}) => {
  if (!userId) {
    const error = new Error("User ID is required to initiate a refund.");
    error.statusCode = 401;
    throw error;
  }

  if (!paymentIdentifier || typeof paymentIdentifier !== "string") {
    const error = new Error("Payment identifier is required.");
    error.statusCode = 400;
    throw error;
  }

  const cleanId = paymentIdentifier.trim();
  const sanitizedIdempotencyKey = idempotencyKey ? String(idempotencyKey).trim() : null;

  // 1. Locate original payment record
  const payment = await PaymentModel.findOne({
    $or: [
      { internalPaymentId: cleanId },
      { razorpayOrderId: cleanId },
      { razorpayPaymentId: cleanId },
    ],
  });

  if (!payment) {
    const error = new Error(`Original payment record not found for '${cleanId}'.`);
    error.statusCode = 404;
    throw error;
  }

  // 2. Strict User Ownership Validation
  if (payment.userId !== String(userId)) {
    const error = new Error("Access denied. You cannot refund a payment belonging to another user.");
    error.statusCode = 403;
    throw error;
  }

  // 3. Verify Payment Status Eligibility (Only CAPTURED or CREDITED can be refunded)
  if (payment.status !== "CAPTURED" && payment.status !== "CREDITED") {
    const error = new Error(
      `Cannot refund payment in '${payment.status}' status. Only captured or credited payments are eligible for refund.`
    );
    error.statusCode = 400;
    throw error;
  }

  if (!payment.razorpayPaymentId) {
    const error = new Error("Original payment has no associated gateway payment ID.");
    error.statusCode = 400;
    throw error;
  }

  // 4. Check Current Refund Limits
  const currentRefunded = Number(payment.amountRefunded || 0);
  const totalAmount = Number(payment.amount);
  const remainingRefundable = totalAmount - currentRefunded;

  if (remainingRefundable <= 0 || payment.refundStatus === "FULL") {
    const error = new Error("Payment has already been fully refunded.");
    error.statusCode = 400;
    throw error;
  }

  // 5. Determine and Validate Refund Amount (Paise)
  let refundAmountPaise;
  if (amount === null || amount === undefined) {
    refundAmountPaise = remainingRefundable;
  } else {
    refundAmountPaise = Number(amount);
    if (!Number.isInteger(refundAmountPaise) || refundAmountPaise <= 0) {
      const error = new Error("Refund amount must be a positive integer in paise.");
      error.statusCode = 400;
      throw error;
    }

    if (refundAmountPaise < 100) {
      const error = new Error("Minimum refund amount is 100 paise (₹1).");
      error.statusCode = 400;
      throw error;
    }

    if (refundAmountPaise > remainingRefundable) {
      const error = new Error(
        `Requested refund amount (${refundAmountPaise} paise / ₹${refundAmountPaise / 100}) exceeds remaining refundable amount (${remainingRefundable} paise / ₹${remainingRefundable / 100}).`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  const refundAmountRupees = Number((refundAmountPaise / 100).toFixed(2));

  // 6. Database-Level Check for Idempotency Key (Multi-Instance Safe)
  if (sanitizedIdempotencyKey) {
    // Check dedicated Refund collection first
    const existingRefundDoc = await RefundModel.findOne({
      paymentId: payment.internalPaymentId,
      idempotencyKey: sanitizedIdempotencyKey,
    });

    if (existingRefundDoc) {
      if (existingRefundDoc.status === "PROCESSED") {
        return formatDuplicateRefundResponse(existingRefundDoc, payment);
      }
      if (existingRefundDoc.status === "PENDING" && existingRefundDoc.razorpayRefundId) {
        return formatDuplicateRefundResponse(existingRefundDoc, payment);
      }
    }

    // Also check embedded array in PaymentModel for backward compatibility
    const existingInPayment = payment.refunds?.find(
      (r) => r.idempotencyKey === sanitizedIdempotencyKey
    );
    if (existingInPayment && existingInPayment.status === "PROCESSED") {
      return formatDuplicateRefundResponse(existingInPayment, payment);
    }
  }

  // 7. Acquire User Lock to Serialize Financial Modifications locally
  await acquireUserLock(String(userId));

  const internalRefundId = generateInternalRefundId();
  let pendingRefundDoc = null;

  try {
    // Re-fetch payment under lock to prevent local race conditions
    const lockedPayment = await PaymentModel.findOne({ _id: payment._id });
    if (!lockedPayment) {
      throw new Error("Payment record disappeared during lock acquisition.");
    }

    const lockedCurrentRefunded = Number(lockedPayment.amountRefunded || 0);
    const lockedRemaining = Number(lockedPayment.amount) - lockedCurrentRefunded;
    if (lockedRemaining < refundAmountPaise) {
      const error = new Error(
        `Concurrent refund detected. Remaining refundable amount is now ${lockedRemaining} paise.`
      );
      error.statusCode = 400;
      throw error;
    }

    // 8. Create Durable PENDING Refund Record in MongoDB before calling Gateway
    // This enforces database-level uniqueness across multi-node clusters via { paymentId, idempotencyKey }
    if (sanitizedIdempotencyKey) {
      try {
        pendingRefundDoc = await RefundModel.create({
          refundId: internalRefundId,
          paymentId: lockedPayment.internalPaymentId,
          internalPaymentId: lockedPayment.internalPaymentId,
          razorpayPaymentId: lockedPayment.razorpayPaymentId,
          userId: String(userId),
          amount: refundAmountPaise,
          amountRupees: refundAmountRupees,
          currency: "INR",
          status: "PENDING",
          initiatedBy: String(userId),
          walletDeductionStatus: "PENDING",
          idempotencyKey: sanitizedIdempotencyKey,
          reason: reason || null,
          notes: {
            reason: reason || "User requested refund",
            internalRefundId,
            idempotencyKey: sanitizedIdempotencyKey,
          },
          createdAt: new Date(),
        });
      } catch (createErr) {
        // E11000 duplicate key error on { paymentId: 1, idempotencyKey: 1 }
        if (createErr.code === 11000) {
          console.log(
            `[initiatePaymentRefund] MongoDB duplicate-key caught for idempotencyKey '${sanitizedIdempotencyKey}' on payment '${lockedPayment.internalPaymentId}'.`
          );
          const duplicateRecord = await RefundModel.findOne({
            paymentId: lockedPayment.internalPaymentId,
            idempotencyKey: sanitizedIdempotencyKey,
          });
          if (duplicateRecord) {
            return formatDuplicateRefundResponse(duplicateRecord, lockedPayment);
          }
        }
        throw createErr;
      }
    } else {
      pendingRefundDoc = await RefundModel.create({
        refundId: internalRefundId,
        paymentId: lockedPayment.internalPaymentId,
        internalPaymentId: lockedPayment.internalPaymentId,
        razorpayPaymentId: lockedPayment.razorpayPaymentId,
        userId: String(userId),
        amount: refundAmountPaise,
        amountRupees: refundAmountRupees,
        currency: "INR",
        status: "PENDING",
        initiatedBy: String(userId),
        walletDeductionStatus: "PENDING",
        reason: reason || null,
        notes: {
          reason: reason || "User requested refund",
          internalRefundId,
        },
        createdAt: new Date(),
      });
    }

    // 9. Wallet Accounting: Conditional Atomic Update with Transaction Session
    let walletDeductionStatus = "NOT_APPLICABLE";
    let walletTransactionId = null;
    let walletReversalNotes = null;
    let balanceBefore = 0;
    let balanceAfter = 0;
    let deductedPayinRupees = 0;

    // Rule 9a: If original deposit was never CREDITED, skip wallet reversal
    if (lockedPayment.status !== "CREDITED") {
      walletDeductionStatus = "SKIPPED_UNCREDITED";
      walletReversalNotes = "Original payment was not credited to trading wallet; no wallet debit required.";
    } else if (deductFromWallet) {
      // Fetch user funds to evaluate margin and cash
      const userFunds = await FundsModel.findOne({ userId: String(userId) });
      const currentMargin = Number(userFunds?.availableMargin || 0);
      const currentCash = Number(userFunds?.availableCash || 0);

      if (currentMargin < refundAmountRupees || currentCash < refundAmountRupees) {
        walletDeductionStatus = "INSUFFICIENT_FUNDS";
        walletReversalNotes = `Insufficient available margin/cash (required: ₹${refundAmountRupees}, available: ₹${currentMargin}). Wallet deduction skipped to protect user portfolio from deficit.`;
        console.warn(
          `[PaymentRefund] Safe Wallet Policy: Skipped automatic debit for user ${userId}. Required: ₹${refundAmountRupees}. Deficit prevented.`
        );
      } else {
        balanceBefore = currentMargin;
        balanceAfter = Number((balanceBefore - refundAmountRupees).toFixed(2));

        // Detect MongoDB replica-set transaction support accurately
        const useTransaction = isTransactionSupported();
        let session = null;
        if (useTransaction) {
          try {
            session = await mongoose.startSession();
            session.startTransaction();
          } catch (sessionErr) {
            session = null;
            console.warn("[PaymentRefund] Failed to initialize replica-set session:", sessionErr.message);
          }
        }

        try {
          // Pipeline update with atomic $max clamp:
          // Clamps payin deduction to current database value inside the write!
          // payin = Math.max(0, payin - refundAmountRupees)
          // availableCash = availableCash - refundAmountRupees
          // availableMargin = availableMargin - refundAmountRupees
          const updateOptions = {
            updatePipeline: true,
            ...(session ? { session } : {}),
          };

          const updateResult = await FundsModel.updateOne(
            {
              userId: String(userId),
              availableMargin: { $gte: refundAmountRupees },
              availableCash: { $gte: refundAmountRupees },
            },
            [
              {
                $set: {
                  availableCash: {
                    $round: [{ $subtract: ["$availableCash", refundAmountRupees] }, 2],
                  },
                  availableMargin: {
                    $round: [{ $subtract: ["$availableMargin", refundAmountRupees] }, 2],
                  },
                  payin: {
                    $max: [
                      0,
                      { $round: [{ $subtract: ["$payin", refundAmountRupees] }, 2] },
                    ],
                  },
                  updatedAt: "$$NOW",
                },
              },
            ],
            updateOptions
          );

          if (updateResult.matchedCount === 0 || updateResult.modifiedCount === 0) {
            if (session) {
              await session.abortTransaction();
            }
            walletDeductionStatus = "INSUFFICIENT_FUNDS";
            walletReversalNotes = "Insufficient available margin/cash at moment of debit.";
          } else {
            // Find updated funds document to record exact actual payin deducted
            const postDebitFunds = await FundsModel.findOne({ userId: String(userId) }).session(
              session || null
            );
            const postPayin = postDebitFunds ? Number(postDebitFunds.payin || 0) : 0;
            deductedPayinRupees = Math.max(
              0,
              Number(((userFunds?.payin || 0) - postPayin).toFixed(2))
            );

            const ledgerOptions = session ? { session } : {};
            const ledgerDocs = await WalletTransactionModel.create(
              [
                {
                  userId: String(userId),
                  paymentId: internalRefundId,
                  referencePaymentId: lockedPayment.razorpayPaymentId,
                  razorpayOrderId: lockedPayment.razorpayOrderId,
                  type: "REFUND",
                  transactionType: "REFUND",
                  amount: refundAmountPaise,
                  amountPaise: refundAmountPaise,
                  amountRupees: refundAmountRupees,
                  currency: "INR",
                  balanceBefore,
                  balanceBeforeRupees: balanceBefore,
                  balanceAfter,
                  balanceAfterRupees: balanceAfter,
                  status: "COMPLETED",
                  description: `Refund for deposit (${lockedPayment.razorpayPaymentId || lockedPayment.internalPaymentId})`,
                  timestamp: new Date(),
                },
              ],
              ledgerOptions
            );

            if (session) {
              await session.commitTransaction();
            }
            walletTransactionId = ledgerDocs[0]._id;
            walletDeductionStatus = "DEDUCTED";
            walletReversalNotes = `Atomic wallet debit of ₹${refundAmountRupees} completed successfully.`;
            notifyUserFundsUpdated(String(userId));
          }
        } catch (txErr) {
          if (session) {
            await session.abortTransaction();
          }
          console.error("[PaymentRefund] Wallet debit database error:", txErr.message);
          const error = new Error(`Wallet debit database failure: ${txErr.message}`);
          error.statusCode = 500;
          throw error;
        } finally {
          if (session) {
            session.endSession();
          }
        }
      }
    } else {
      walletDeductionStatus = "UNTOUCHED";
      walletReversalNotes = "Wallet deduction was not requested (deductFromWallet=false).";
    }

    // 10. Call Razorpay SDK Refund API
    const client = clientOverride || razorpayClient;
    if (!client) {
      if (pendingRefundDoc) {
        pendingRefundDoc.status = "FAILED";
        pendingRefundDoc.failureReason = "Payment gateway client is not configured.";
        await pendingRefundDoc.save();
      }
      const error = new Error("Payment gateway client is not configured.");
      error.statusCode = 503;
      throw error;
    }

    let rzpRefund;
    try {
      if (client.payments && typeof client.payments.refund === "function") {
        rzpRefund = await client.payments.refund(lockedPayment.razorpayPaymentId, {
          amount: refundAmountPaise,
          notes: {
            reason: reason || "User requested refund",
            internalPaymentId: lockedPayment.internalPaymentId,
            internalRefundId,
            idempotencyKey: sanitizedIdempotencyKey || undefined,
          },
          speed: "normal",
          receipt: internalRefundId,
        });
      } else {
        throw new Error("Razorpay client does not support payments.refund method.");
      }
    } catch (rzpErr) {
      console.error("[Razorpay Refund API Error]:", {
        message: rzpErr.message,
        statusCode: rzpErr.statusCode,
        code: rzpErr.code,
      });

      const isDefinite = isDefiniteGatewayRejection(rzpErr);

      if (isDefinite) {
        // 1. Authoritative Gateway Rejection (e.g. 400 Bad Request, already refunded)
        if (pendingRefundDoc) {
          pendingRefundDoc.status = "FAILED";
          pendingRefundDoc.reconciliationStatus = "RECONCILED";
          pendingRefundDoc.failureReason =
            rzpErr.error?.description || rzpErr.message || "Gateway definitely rejected refund";
          pendingRefundDoc.walletDeductionStatus =
            walletDeductionStatus === "DEDUCTED" ? "ROLLED_BACK" : walletDeductionStatus;
          await pendingRefundDoc.save();
        }

        // Authoritative rejection: restore wallet funds
        if (walletDeductionStatus === "DEDUCTED" && walletTransactionId) {
          try {
            await FundsModel.updateOne(
              { userId: String(userId) },
              {
                $inc: {
                  availableCash: refundAmountRupees,
                  availableMargin: refundAmountRupees,
                  payin: deductedPayinRupees,
                },
                $set: { updatedAt: new Date() },
              }
            );
            await WalletTransactionModel.updateOne(
              { _id: walletTransactionId },
              { $set: { status: "FAILED", description: "Refund voided due to gateway rejection" } }
            );
            notifyUserFundsUpdated(String(userId));
          } catch (rollbackErr) {
            console.error("[PaymentRefund] Critical: rollback failed:", rollbackErr.message);
          }
        }

        const error = new Error(
          rzpErr.error?.description || rzpErr.message || "Failed to process refund at payment gateway."
        );
        error.statusCode = rzpErr.statusCode || 400;
        throw error;
      } else {
        // 2. UNCERTAIN OUTCOME (timeout, ECONNRESET, 502/503/504)
        // DO NOT mark FAILED! DO NOT restore wallet funds automatically!
        if (pendingRefundDoc) {
          pendingRefundDoc.status = "PENDING";
          pendingRefundDoc.isGatewayUncertain = true;
          pendingRefundDoc.reconciliationStatus = "UNRECONCILED";
          pendingRefundDoc.failureReason = `Gateway response uncertain (${rzpErr.code || rzpErr.statusCode}): ${rzpErr.message}`;
          pendingRefundDoc.reconciliationNotes = "Inconclusive gateway outcome; queued for authoritative reconciliation.";
          await pendingRefundDoc.save();
        }

        const error = new Error(
          "Refund request dispatched, but gateway response was inconclusive. Background reconciliation will authoritatively verify the refund."
        );
        error.statusCode = rzpErr.statusCode || 504;
        error.isUncertain = true;
        error.internalRefundId = internalRefundId;
        throw error;
      }
    }

    if (!rzpRefund || !rzpRefund.id) {
      if (pendingRefundDoc) {
        pendingRefundDoc.status = "FAILED";
        pendingRefundDoc.failureReason = "Payment gateway returned an invalid refund record.";
        await pendingRefundDoc.save();
      }
      const error = new Error("Payment gateway returned an invalid refund record.");
      error.statusCode = 502;
      throw error;
    }

    // 11. Finalize and Persist Refund Records
    const newAmountRefunded = lockedCurrentRefunded + refundAmountPaise;
    const isFullRefund = newAmountRefunded >= Number(lockedPayment.amount);
    const newRefundStatus = isFullRefund ? "FULL" : "PARTIAL";
    const isReconciled =
      walletDeductionStatus === "DEDUCTED" ||
      walletDeductionStatus === "SKIPPED_UNCREDITED";

    // Update durable RefundModel
    if (pendingRefundDoc) {
      pendingRefundDoc.razorpayRefundId = rzpRefund.id;
      pendingRefundDoc.status = (rzpRefund.status || "processed").toUpperCase();
      pendingRefundDoc.speed = rzpRefund.speed_processed || "normal";
      pendingRefundDoc.walletDeductionStatus = walletDeductionStatus;
      pendingRefundDoc.walletTransactionId = walletTransactionId;
      pendingRefundDoc.walletReversalNotes = walletReversalNotes;
      pendingRefundDoc.reconciled = isReconciled;
      pendingRefundDoc.processedAt = rzpRefund.status === "failed" ? null : new Date();
      await pendingRefundDoc.save();
    }

    // Update PaymentModel embedded array for complete backward compatibility
    const refundDoc = {
      refundId: internalRefundId,
      razorpayRefundId: rzpRefund.id,
      amount: refundAmountPaise,
      amountRupees: refundAmountRupees,
      currency: "INR",
      status: (rzpRefund.status || "processed").toUpperCase(),
      speed: rzpRefund.speed_processed || "normal",
      reason: reason || null,
      notes: rzpRefund.notes || {},
      initiatedBy: String(userId),
      walletDeductionStatus,
      walletTransactionId,
      walletReversalNotes,
      reconciled: isReconciled,
      idempotencyKey: sanitizedIdempotencyKey,
      createdAt: new Date(),
      processedAt: rzpRefund.status === "failed" ? null : new Date(),
    };

    lockedPayment.refunds.push(refundDoc);
    lockedPayment.amountRefunded = newAmountRefunded;
    lockedPayment.refundStatus = newRefundStatus;
    lockedPayment.updatedAt = new Date();
    await lockedPayment.save();

    return {
      success: true,
      isDuplicate: false,
      message:
        walletDeductionStatus === "DEDUCTED"
          ? `Refund of ₹${refundAmountRupees} completed and wallet debited.`
          : walletDeductionStatus === "INSUFFICIENT_FUNDS"
          ? `Refund of ₹${refundAmountRupees} processed at gateway, but wallet could not be debited due to insufficient available margin.`
          : `Refund of ₹${refundAmountRupees} initiated successfully.`,
      gatewayRefund: {
        id: rzpRefund.id,
        status: (rzpRefund.status || "processed").toUpperCase(),
        amountPaise: refundAmountPaise,
        amountRupees: refundAmountRupees,
        currency: "INR",
      },
      walletReversal: {
        status: walletDeductionStatus,
        walletTransactionId,
        notes: walletReversalNotes,
      },
      reconciled: isReconciled,
      refund: {
        refundId: internalRefundId,
        razorpayRefundId: rzpRefund.id,
        amountPaise: refundAmountPaise,
        amountRupees: refundAmountRupees,
        status: refundDoc.status,
        refundStatus: newRefundStatus,
        walletDeductionStatus,
        reconciled: isReconciled,
        createdAt: refundDoc.createdAt,
      },
    };
  } finally {
    releaseUserLock(String(userId));
  }
};

/**
 * Handles incoming refund webhook events (refund.processed, refund.failed) idempotently.
 * Strictly validates the refund amount and never invents or defaults to 100 paise.
 *
 * @param {Object} params
 * @param {string} params.eventType - 'refund.processed' or 'refund.failed'
 * @param {Object} params.refundEntity - The parsed payload.refund.entity
 * @param {Object} [params.paymentEntity] - The parsed payload.payment.entity
 * @returns {Promise<Object>} Outcome of webhook processing
 */
const handleRefundWebhookEvent = async ({
  eventType,
  refundEntity,
  paymentEntity = null,
  eventId = null,
}) => {
  if (!refundEntity || !refundEntity.id) {
    logWebhook({
      level: "error",
      stage: "refund_validation",
      eventId,
      eventType,
      errorCode: "MISSING_REFUND_ENTITY",
      message: "Missing refund entity in webhook payload.",
    });
    return { success: false, reason: "Missing refund entity in webhook payload." };
  }

  const razorpayRefundId = refundEntity.id;
  const razorpayPaymentId = refundEntity.payment_id || paymentEntity?.id;

  // 1. Strict Validation of Refund Amount
  // Must be a positive integer in paise. Never invent an amount.
  const rawAmount = refundEntity.amount;
  let refundAmount = null;

  if (
    rawAmount !== undefined &&
    rawAmount !== null &&
    rawAmount !== "" &&
    typeof rawAmount !== "boolean"
  ) {
    const num = Number(rawAmount);
    if (Number.isInteger(num) && num > 0) {
      refundAmount = num;
    }
  }

  if (!razorpayPaymentId) {
    logWebhook({
      level: "error",
      stage: "refund_validation",
      eventId,
      eventType,
      refundId: razorpayRefundId,
      errorCode: "MISSING_PAYMENT_ID",
      message: "Refund entity lacks payment_id.",
    });
    return { success: false, reason: "Refund entity lacks payment_id." };
  }

  // Locate associated payment record
  const payment = await PaymentModel.findOne({
    $or: [
      { "refunds.razorpayRefundId": razorpayRefundId },
      { razorpayPaymentId },
    ],
  });

  if (!payment) {
    logWebhook({
      level: "warn",
      stage: "refund_correlation",
      eventId,
      eventType,
      refundId: razorpayRefundId,
      paymentId: razorpayPaymentId,
      message: `Associated payment record not found for refund ${razorpayRefundId}.`,
    });
    return { success: false, reason: "Associated payment record not found." };
  }

  // 2. Authoritative Resolution: If webhook amount is missing or invalid, resolve ONLY from existing verified records
  if (refundAmount === null) {
    const existingRefundInCollection = await RefundModel.findOne({ razorpayRefundId });
    if (
      existingRefundInCollection &&
      Number.isInteger(existingRefundInCollection.amount) &&
      existingRefundInCollection.amount > 0
    ) {
      refundAmount = existingRefundInCollection.amount;
      logWebhook({
        level: "info",
        stage: "refund_resolution",
        eventId,
        eventType,
        refundId: razorpayRefundId,
        message: `Resolved missing/invalid amount from RefundModel: ${refundAmount} paise.`,
      });
    } else {
      const existingInPayment = payment.refunds?.find(
        (r) => r.razorpayRefundId === razorpayRefundId
      );
      if (
        existingInPayment &&
        Number.isInteger(existingInPayment.amount) &&
        existingInPayment.amount > 0
      ) {
        refundAmount = existingInPayment.amount;
        logWebhook({
          level: "info",
          stage: "refund_resolution",
          eventId,
          eventType,
          refundId: razorpayRefundId,
          message: `Resolved missing/invalid amount from payment.refunds: ${refundAmount} paise.`,
        });
      }
    }
  }

  // 3. Reject or Quarantine if amount cannot be authoritatively resolved
  // NEVER invent or default to 100 paise.
  if (refundAmount === null) {
    logWebhook({
      level: "warn",
      stage: "refund_validation",
      eventId,
      eventType,
      refundId: razorpayRefundId,
      paymentId: payment.internalPaymentId,
      errorCode: "MALFORMED_AMOUNT",
      message: `Quarantined malformed webhook for refund ${razorpayRefundId}: amount '${rawAmount}' is missing/invalid and not found in existing records.`,
    });
    return {
      success: false,
      quarantined: true,
      reason: `Malformed refund amount: '${rawAmount}'. Amount must be a positive integer in paise.`,
      razorpayRefundId,
    };
  }

  const userId = payment.userId;
  await acquireUserLock(userId);

  try {
    const lockedPayment = await PaymentModel.findOne({ _id: payment._id });
    if (!lockedPayment) return { success: false, reason: "Payment disappeared." };

    const matchedInternalRefundId =
      refundEntity.notes?.internalRefundId || refundEntity.receipt || null;

    let existingRefund = lockedPayment.refunds.find(
      (r) =>
        r.razorpayRefundId === razorpayRefundId ||
        (matchedInternalRefundId && r.refundId === matchedInternalRefundId)
    );

    logWebhook({
      level: "info",
      stage: "refund_correlation",
      eventId,
      eventType,
      refundId: razorpayRefundId,
      paymentId: lockedPayment.internalPaymentId,
      message: `Correlated refund event '${razorpayRefundId}' with payment '${lockedPayment.internalPaymentId}'.`,
    });

    const existingRefundDoc = await RefundModel.findOne({
      $or: [
        { razorpayRefundId },
        ...(matchedInternalRefundId ? [{ refundId: matchedInternalRefundId }] : []),
        ...(existingRefund ? [{ refundId: existingRefund.refundId }] : []),
      ],
    });

    if (eventType === "refund.processed") {
      if (existingRefund) {
        if (existingRefund.status === "PROCESSED") {
          // Idempotent duplicate delivery
          logWebhook({
            level: "warn",
            stage: "refund_duplicate",
            eventId,
            eventType,
            refundId: razorpayRefundId,
            paymentId: lockedPayment.internalPaymentId,
            status: "PROCESSED",
            message: `Duplicate refund webhook event detected for '${razorpayRefundId}'.`,
          });
          return { success: true, isDuplicate: true, status: "PROCESSED" };
        }
        existingRefund.status = "PROCESSED";
        existingRefund.razorpayRefundId = razorpayRefundId;
        existingRefund.processedAt = new Date();
      } else if (existingRefundDoc) {
        // Internal refund that was pending / uncertain
        existingRefund = {
          refundId: existingRefundDoc.refundId,
          razorpayRefundId,
          amount: refundAmount,
          amountRupees: Number((refundAmount / 100).toFixed(2)),
          currency: refundEntity.currency || "INR",
          status: "PROCESSED",
          speed: refundEntity.speed_processed || "normal",
          reason: refundEntity.notes?.reason || existingRefundDoc.reason || "Processed via Razorpay webhook",
          initiatedBy: existingRefundDoc.initiatedBy || "USER",
          walletDeductionStatus: existingRefundDoc.walletDeductionStatus,
          walletReversalNotes: existingRefundDoc.walletReversalNotes,
          reconciled: existingRefundDoc.reconciled,
          createdAt: existingRefundDoc.createdAt,
          processedAt: new Date(),
        };

        lockedPayment.refunds.push(existingRefund);
        lockedPayment.amountRefunded = (lockedPayment.amountRefunded || 0) + refundAmount;
        lockedPayment.refundStatus =
          lockedPayment.amountRefunded >= lockedPayment.amount ? "FULL" : "PARTIAL";
      } else {
        // External refund created via dashboard
        const internalRefundId = generateInternalRefundId();
        const refundDoc = {
          refundId: internalRefundId,
          razorpayRefundId,
          amount: refundAmount,
          amountRupees: Number((refundAmount / 100).toFixed(2)),
          currency: refundEntity.currency || "INR",
          status: "PROCESSED",
          speed: refundEntity.speed_processed || "normal",
          reason: refundEntity.notes?.reason || "Processed via Razorpay webhook",
          initiatedBy: "GATEWAY",
          walletDeductionStatus: "UNTOUCHED",
          walletReversalNotes: "External gateway refund processed via webhook; wallet untouched.",
          reconciled: false,
          createdAt: new Date(refundEntity.created_at * 1000 || Date.now()),
          processedAt: new Date(),
        };

        lockedPayment.refunds.push(refundDoc);
        lockedPayment.amountRefunded = (lockedPayment.amountRefunded || 0) + refundAmount;
        lockedPayment.refundStatus =
          lockedPayment.amountRefunded >= lockedPayment.amount ? "FULL" : "PARTIAL";
      }

      await lockedPayment.save();

      // Sync RefundModel collection
      await RefundModel.findOneAndUpdate(
        {
          $or: [
            { razorpayRefundId },
            ...(matchedInternalRefundId ? [{ refundId: matchedInternalRefundId }] : []),
            ...(existingRefund ? [{ refundId: existingRefund.refundId }] : []),
            ...(existingRefundDoc ? [{ refundId: existingRefundDoc.refundId }] : []),
          ],
        },
        {
          $set: {
            razorpayRefundId,
            status: "PROCESSED",
            amount: refundAmount,
            amountRupees: Number((refundAmount / 100).toFixed(2)),
            processedAt: new Date(),
            isGatewayUncertain: false,
            reconciliationStatus: "RECONCILED",
          },
        }
      );

      logWebhook({
        level: "info",
        stage: "refund_status_update",
        eventId,
        eventType,
        refundId: razorpayRefundId,
        paymentId: lockedPayment.internalPaymentId,
        status: "PROCESSED",
        message: `Refund '${razorpayRefundId}' status updated to PROCESSED.`,
      });

      return { success: true, isDuplicate: false, status: "PROCESSED" };
    }

    if (eventType === "refund.failed") {
      if (existingRefund) {
        if (existingRefund.status === "FAILED") {
          logWebhook({
            level: "warn",
            stage: "refund_duplicate",
            eventId,
            eventType,
            refundId: razorpayRefundId,
            paymentId: lockedPayment.internalPaymentId,
            status: "FAILED",
            message: `Duplicate refund.failed webhook event detected for '${razorpayRefundId}'.`,
          });
          return { success: true, isDuplicate: true, status: "FAILED" };
        }
        existingRefund.status = "FAILED";
        existingRefund.failureReason =
          refundEntity.error_description || "Refund failed at gateway.";

        // Deduct from amountRefunded if it was previously credited
        lockedPayment.amountRefunded = Math.max(
          0,
          (lockedPayment.amountRefunded || 0) - existingRefund.amount
        );
        lockedPayment.refundStatus =
          lockedPayment.amountRefunded === 0
            ? "NONE"
            : lockedPayment.amountRefunded >= lockedPayment.amount
            ? "FULL"
            : "PARTIAL";
      } else {
        // Record failed external refund
        lockedPayment.refunds.push({
          refundId: generateInternalRefundId(),
          razorpayRefundId,
          amount: refundAmount,
          amountRupees: Number((refundAmount / 100).toFixed(2)),
          currency: refundEntity.currency || "INR",
          status: "FAILED",
          failureReason: refundEntity.error_description || "Refund failed at gateway.",
          initiatedBy: "GATEWAY",
          walletDeductionStatus: "NOT_APPLICABLE",
          createdAt: new Date(),
        });
      }

      await lockedPayment.save();

      // Sync RefundModel collection
      await RefundModel.findOneAndUpdate(
        {
          $or: [
            { razorpayRefundId },
            ...(matchedInternalRefundId ? [{ refundId: matchedInternalRefundId }] : []),
            ...(existingRefund ? [{ refundId: existingRefund.refundId }] : []),
            ...(existingRefundDoc ? [{ refundId: existingRefundDoc.refundId }] : []),
          ],
        },
        {
          $set: {
            status: "FAILED",
            failureReason: refundEntity.error_description || "Refund failed at gateway.",
            isGatewayUncertain: false,
            reconciliationStatus: "RECONCILED",
          },
        }
      );

      logWebhook({
        level: "warn",
        stage: "refund_status_update",
        eventId,
        eventType,
        refundId: razorpayRefundId,
        paymentId: lockedPayment.internalPaymentId,
        status: "FAILED",
        message: `Refund '${razorpayRefundId}' marked FAILED at gateway (${refundEntity.error_description || "Gateway failure"}).`,
      });

      return { success: true, isDuplicate: false, status: "FAILED" };
    }

    return { success: false, reason: `Unknown refund event type '${eventType}'` };
  } finally {
    releaseUserLock(userId);
  }
};

const MAX_RECONCILIATION_ATTEMPTS = 10;

/**
 * Reconciles any stale PENDING refunds against Razorpay to ensure durable recovery
 * if a server crashed or restarted between gateway dispatch and database update.
 */
const reconcilePendingRefunds = async ({
  staleThresholdMs = 60 * 1000,
  clientOverride = null,
} = {}) => {
  const client = clientOverride || razorpayClient;
  if (!client) return { count: 0, reconciled: 0 };

  const thresholdDate = new Date(Date.now() - staleThresholdMs);
  const pendingRefunds = await RefundModel.find({
    status: "PENDING",
    reconciliationStatus: { $ne: "FLAGGED" },
    createdAt: { $lte: thresholdDate },
  }).limit(50);

  let reconciledCount = 0;
  for (const refund of pendingRefunds) {
    refund.reconciliationAttempts = (refund.reconciliationAttempts || 0) + 1;
    refund.reconciliationLastChecked = new Date();

    try {
      let rzpRefund = null;
      if (refund.razorpayRefundId && client.refunds?.fetch) {
        rzpRefund = await client.refunds.fetch(refund.razorpayRefundId);
      } else if (refund.razorpayPaymentId) {
        // Supported Razorpay SDK v2.9.8 method: client.payments.fetchMultipleRefund(paymentId, params)
        if (typeof client.payments?.fetchMultipleRefund === "function") {
          let hasMore = true;
          let skip = 0;
          const count = 50;
          const maxSkip = 250; // Bound pagination safely

          while (hasMore && !rzpRefund && skip <= maxSkip) {
            const resp = await client.payments.fetchMultipleRefund(refund.razorpayPaymentId, {
              count,
              skip,
            });
            const items = Array.isArray(resp) ? resp : resp?.items || [];
            if (!items.length) {
              hasMore = false;
              break;
            }

            rzpRefund = items.find(
              (r) =>
                r.id === refund.razorpayRefundId ||
                r.receipt === refund.refundId ||
                r.notes?.internalRefundId === refund.refundId
            );

            if (rzpRefund || items.length < count) {
              hasMore = false;
            } else {
              skip += count;
            }
          }
        } else if (typeof client.refunds?.all === "function") {
          // Alternative supported SDK collection endpoint
          const resp = await client.refunds.all({ payment_id: refund.razorpayPaymentId });
          const items = resp?.items || [];
          rzpRefund = items.find(
            (r) =>
              r.id === refund.razorpayRefundId ||
              r.receipt === refund.refundId ||
              r.notes?.internalRefundId === refund.refundId
          );
        }
      }

      if (rzpRefund) {
        const rzpStatus = (rzpRefund.status || "processed").toUpperCase();
        refund.razorpayRefundId = rzpRefund.id;
        refund.isGatewayUncertain = false;

        if (rzpStatus === "PROCESSED") {
          refund.status = "PROCESSED";
          refund.reconciliationStatus = "RECONCILED";
          refund.processedAt = new Date();
          refund.reconciliationNotes = `Authoritatively reconciled via Razorpay: ${rzpRefund.id}`;
          await refund.save();

          // Sync PaymentModel
          const payment = await PaymentModel.findOne({ internalPaymentId: refund.paymentId });
          if (payment) {
            const inPayment = payment.refunds.find((r) => r.refundId === refund.refundId);
            if (inPayment) {
              inPayment.status = "PROCESSED";
              inPayment.razorpayRefundId = rzpRefund.id;
              inPayment.processedAt = new Date();
            } else {
              payment.refunds.push({
                refundId: refund.refundId,
                razorpayRefundId: rzpRefund.id,
                amount: refund.amount,
                amountRupees: refund.amountRupees,
                currency: refund.currency,
                status: "PROCESSED",
                walletDeductionStatus: refund.walletDeductionStatus,
                createdAt: refund.createdAt,
                processedAt: new Date(),
              });
            }
            payment.amountRefunded = (payment.amountRefunded || 0) + refund.amount;
            payment.refundStatus = payment.amountRefunded >= payment.amount ? "FULL" : "PARTIAL";
            await payment.save();
          }
          reconciledCount++;
        } else if (rzpStatus === "FAILED") {
          refund.status = "FAILED";
          refund.reconciliationStatus = "RECONCILED";
          refund.failureReason = rzpRefund.error_description || "Refund confirmed failed at gateway";
          refund.reconciliationNotes = `Authoritatively confirmed failed by gateway: ${rzpRefund.id}`;
          await refund.save();

          // Authoritative failure confirmed: restore wallet funds if previously debited
          if (refund.walletDeductionStatus === "DEDUCTED" && refund.walletTransactionId) {
            await FundsModel.updateOne(
              { userId: refund.userId },
              {
                $inc: {
                  availableCash: refund.amountRupees,
                  availableMargin: refund.amountRupees,
                  payin: refund.amountRupees,
                },
                $set: { updatedAt: new Date() },
              }
            );
            await WalletTransactionModel.updateOne(
              { _id: refund.walletTransactionId },
              { $set: { status: "FAILED", description: "Refund voided: gateway confirmed failure" } }
            );
            refund.walletDeductionStatus = "ROLLED_BACK";
            await refund.save();
            notifyUserFundsUpdated(refund.userId);
          }
        } else {
          // Status is PENDING at gateway: retain PENDING
          refund.status = "PENDING";
          refund.reconciliationNotes = `Gateway refund is currently ${rzpStatus}. Retaining PENDING.`;
          await refund.save();
        }
      } else {
        // No matching refund found at gateway yet.
        if (refund.reconciliationAttempts >= MAX_RECONCILIATION_ATTEMPTS) {
          refund.reconciliationStatus = "FLAGGED";
          refund.reconciliationNotes = `Exceeded max reconciliation attempts (${MAX_RECONCILIATION_ATTEMPTS}) without gateway confirmation. Flagged for manual investigation.`;
          console.warn(
            `[reconcilePendingRefunds] Flagged stale refund ${refund.refundId} for manual investigation after ${MAX_RECONCILIATION_ATTEMPTS} attempts.`
          );
        } else {
          refund.reconciliationNotes = `Attempt ${refund.reconciliationAttempts}/${MAX_RECONCILIATION_ATTEMPTS}: Gateway match not found yet. Retaining PENDING.`;
        }
        await refund.save();
      }
    } catch (err) {
      console.warn(`[reconcilePendingRefunds] Error querying gateway for refund ${refund.refundId}: ${err.message}. Retaining PENDING.`);
      refund.reconciliationNotes = `Gateway query error: ${err.message}`;
      await refund.save();
    }
  }

  return { count: pendingRefunds.length, reconciled: reconciledCount };
};

/**
 * Retrieves auditable refund history for an internal payment or order ID.
 *
 * @param {Object} params
 * @param {string} params.userId - Authenticated user ID (strictly enforced)
 * @param {string} params.paymentIdentifier - Payment or order identifier
 * @returns {Promise<Object>} Refund audit report
 */
const getPaymentRefundHistory = async ({ userId, paymentIdentifier }) => {
  if (!userId) {
    const error = new Error("User ID is required.");
    error.statusCode = 401;
    throw error;
  }

  if (!paymentIdentifier) {
    const error = new Error("Payment identifier is required.");
    error.statusCode = 400;
    throw error;
  }

  const cleanId = paymentIdentifier.trim();
  const payment = await PaymentModel.findOne({
    $or: [
      { internalPaymentId: cleanId },
      { razorpayOrderId: cleanId },
      { razorpayPaymentId: cleanId },
    ],
  });

  if (!payment) {
    const error = new Error(`Payment record not found for '${cleanId}'.`);
    error.statusCode = 404;
    throw error;
  }

  if (payment.userId !== String(userId)) {
    const error = new Error("Access denied. You cannot view refund history for another user's payment.");
    error.statusCode = 403;
    throw error;
  }

  return {
    success: true,
    payment: {
      internalPaymentId: payment.internalPaymentId,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
      amount: payment.amount,
      amountRupees: Math.floor(payment.amount / 100),
      currency: payment.currency,
      status: payment.status,
      refundStatus: payment.refundStatus || "NONE",
      amountRefunded: payment.amountRefunded || 0,
      amountRefundedRupees: Number(((payment.amountRefunded || 0) / 100).toFixed(2)),
      remainingRefundable: payment.amount - (payment.amountRefunded || 0),
      remainingRefundableRupees: Number(
        ((payment.amount - (payment.amountRefunded || 0)) / 100).toFixed(2)
      ),
      refunds: (payment.refunds || []).map((r) => ({
        refundId: r.refundId,
        razorpayRefundId: r.razorpayRefundId,
        amount: r.amount,
        amountRupees: r.amountRupees || r.amount / 100,
        currency: r.currency,
        status: r.status,
        reason: r.reason,
        initiatedBy: r.initiatedBy,
        walletDeductionStatus: r.walletDeductionStatus,
        walletReversalNotes: r.walletReversalNotes || null,
        reconciled: r.reconciled || false,
        createdAt: r.createdAt,
        processedAt: r.processedAt,
        failureReason: r.failureReason,
      })),
    },
  };
};

module.exports = {
  initiatePaymentRefund,
  handleRefundWebhookEvent,
  reconcilePendingRefunds,
  getPaymentRefundHistory,
  generateInternalRefundId,
  isTransactionSupported,
  isDefiniteGatewayRejection,
};
