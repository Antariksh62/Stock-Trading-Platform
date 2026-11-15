const { PaymentModel } = require("../model/PaymentModel");
const { razorpayClient } = require("../config/razorpay");
const { processCapturedPayment } = require("./paymentProcessingService");
const { reconcilePendingRefunds } = require("./paymentRefundService");

/**
 * Payment Reconciliation Service
 *
 * Responsibilities:
 * 1. Identifies stale or unreconciled payments in CREATED, PENDING, or uncredited CAPTURED states.
 * 2. Fetches authoritative payment/order status from Razorpay API.
 * 3. Enforces multi-level fraud and consistency checks (amount, currency, orderId, duplicate usage).
 * 4. Safely delegates wallet crediting to the central processCapturedPayment service.
 * 5. Uses atomic lease locks for multi-instance distributed concurrency safety.
 * 6. Implements single-process overlap mutex protection and configurable scheduler.
 */

// Configuration constants
const DEFAULT_STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_LOCK_DURATION_MS = 2 * 60 * 1000;    // 2 minutes lease
const DEFAULT_BATCH_SIZE = 25;
const MAX_RECONCILIATION_ATTEMPTS = 10;
const ORDER_ABANDON_EXPIRY_MS = 60 * 60 * 1000;    // 1 hour

let schedulerTimer = null;
let initialTimeout = null;
let isReconciliationRunning = false;

/**
 * Reconciles a single payment record against authoritative Razorpay data.
 *
 * @param {Object} paymentDoc - Mongoose Payment document
 * @param {Object} [options]
 * @param {Object} [options.clientOverride] - Razorpay client override for testing/mocks
 * @returns {Promise<Object>} Outcome of single payment reconciliation
 */
const reconcileSinglePayment = async (paymentDoc, { clientOverride = null } = {}) => {
  const client = clientOverride || razorpayClient;
  const paymentId = paymentDoc.internalPaymentId;
  const orderId = paymentDoc.razorpayOrderId;

  // 1. Guard against reconciling already CREDITED payments
  if (paymentDoc.status === "CREDITED") {
    paymentDoc.reconciliationStatus = "RECONCILED";
    paymentDoc.reconciledAt = paymentDoc.reconciledAt || new Date();
    paymentDoc.reconciliationLockedUntil = null;
    await paymentDoc.save();
    return { status: "SKIPPED_ALREADY_CREDITED", internalPaymentId: paymentId };
  }

  // 2. Guard against missing payment gateway client
  if (!client) {
    paymentDoc.reconciliationLockedUntil = null;
    paymentDoc.reconciliationNotes = "Reconciliation deferred: Razorpay gateway client unavailable";
    await paymentDoc.save();
    return {
      status: "DEFERRED_NO_GATEWAY",
      internalPaymentId: paymentId,
      error: "Razorpay client not configured",
    };
  }

  // 3. Fetch authoritative payment records from Razorpay
  let gatewayPayments = [];
  try {
    if (client.orders && typeof client.orders.fetchPayments === "function") {
      const resp = await client.orders.fetchPayments(orderId);
      gatewayPayments = resp?.items || [];
    } else if (paymentDoc.razorpayPaymentId && client.payments && typeof client.payments.fetch === "function") {
      const singlePay = await client.payments.fetch(paymentDoc.razorpayPaymentId);
      if (singlePay) gatewayPayments = [singlePay];
    }
  } catch (apiErr) {
    const isRateLimited = apiErr.statusCode === 429;
    const isNetworkError = apiErr.code === "ECONNABORTED" || apiErr.code === "ECONNRESET" || apiErr.statusCode >= 500;
    
    paymentDoc.reconciliationLockedUntil = null;
    paymentDoc.reconciliationNotes = `Gateway query error (${apiErr.statusCode || apiErr.code}): ${apiErr.message}`;
    if (paymentDoc.reconciliationAttempts >= MAX_RECONCILIATION_ATTEMPTS) {
      paymentDoc.reconciliationStatus = "FLAGGED";
      paymentDoc.reconciliationNotes += " - Max attempts reached";
    }
    await paymentDoc.save();

    return {
      status: isRateLimited ? "RATE_LIMITED" : isNetworkError ? "NETWORK_ERROR" : "GATEWAY_ERROR",
      internalPaymentId: paymentId,
      error: apiErr.message,
    };
  }

  // 4. Case: No payments found for this order
  if (!gatewayPayments || gatewayPayments.length === 0) {
    const ageMs = Date.now() - new Date(paymentDoc.createdAt).getTime();

    // If order is old and has zero attempts, it was abandoned by the user
    if (ageMs > ORDER_ABANDON_EXPIRY_MS && paymentDoc.status === "CREATED") {
      paymentDoc.status = "FAILED";
      paymentDoc.failureReason = "Checkout abandoned: no payment attempts recorded within expiration window.";
      paymentDoc.reconciliationStatus = "RECONCILED";
      paymentDoc.reconciledAt = new Date();
      paymentDoc.reconciliationNotes = "Marked FAILED due to abandoned order window expiration.";
      paymentDoc.reconciliationLockedUntil = null;
      await paymentDoc.save();

      return { status: "MARKED_ABANDONED", internalPaymentId: paymentId };
    }

    // Still within possible checkout window or awaiting user interaction
    paymentDoc.reconciliationLockedUntil = null;
    paymentDoc.reconciliationNotes = "No payment attempts yet recorded by gateway.";
    await paymentDoc.save();

    return { status: "PENDING_NO_ATTEMPTS", internalPaymentId: paymentId };
  }

  // 5. Select the primary payment attempt (prefer captured > authorized > failed)
  const capturedPayment = gatewayPayments.find((p) => p.status === "captured" || Boolean(p.captured));
  const authorizedPayment = gatewayPayments.find((p) => p.status === "authorized");
  const failedPayment = gatewayPayments.find((p) => p.status === "failed");
  const targetPayment = capturedPayment || authorizedPayment || failedPayment || gatewayPayments[0];

  const actualPaymentId = targetPayment.id;
  const actualAmount = Number(targetPayment.amount);
  const actualCurrency = (targetPayment.currency || "").toUpperCase();
  const actualOrderId = targetPayment.order_id;
  const actualStatus = String(targetPayment.status).toLowerCase();

  // 6. Security and Consistency Validation
  // 6a. Order ID Validation
  if (actualOrderId && actualOrderId !== orderId) {
    paymentDoc.reconciliationStatus = "FLAGGED";
    paymentDoc.reconciliationNotes = `Critical Mismatch: Gateway payment order_id '${actualOrderId}' !== internal orderId '${orderId}'`;
    paymentDoc.reconciliationLockedUntil = null;
    await paymentDoc.save();
    return { status: "FLAGGED_ORDER_MISMATCH", internalPaymentId: paymentId };
  }

  // 6b. Currency Validation
  const expectedCurrency = (paymentDoc.currency || "INR").toUpperCase();
  if (actualCurrency !== expectedCurrency) {
    paymentDoc.reconciliationStatus = "FLAGGED";
    paymentDoc.reconciliationNotes = `Currency Mismatch: expected ${expectedCurrency}, gateway returned ${actualCurrency}`;
    paymentDoc.reconciliationLockedUntil = null;
    await paymentDoc.save();
    return { status: "FLAGGED_CURRENCY_MISMATCH", internalPaymentId: paymentId };
  }

  // 6c. Amount Validation (Paise comparison)
  const expectedAmount = Number(paymentDoc.amount);
  if (actualAmount !== expectedAmount) {
    paymentDoc.reconciliationStatus = "FLAGGED";
    paymentDoc.reconciliationNotes = `Amount Mismatch: expected ${expectedAmount} paise, gateway returned ${actualAmount} paise`;
    paymentDoc.reconciliationLockedUntil = null;
    await paymentDoc.save();
    return { status: "FLAGGED_AMOUNT_MISMATCH", internalPaymentId: paymentId };
  }

  // 6d. Duplicate Payment ID check across other internal records
  const duplicatePayment = await PaymentModel.findOne({
    razorpayPaymentId: actualPaymentId,
    internalPaymentId: { $ne: paymentDoc.internalPaymentId },
  });
  if (duplicatePayment) {
    paymentDoc.reconciliationStatus = "FLAGGED";
    paymentDoc.reconciliationNotes = `Duplicate Payment ID: '${actualPaymentId}' is already associated with '${duplicatePayment.internalPaymentId}'`;
    paymentDoc.reconciliationLockedUntil = null;
    await paymentDoc.save();
    return { status: "FLAGGED_DUPLICATE_PAYMENT_ID", internalPaymentId: paymentId };
  }

  // 7. Handle Status Branches
  // 7A. CAPTURED: Eligible for wallet crediting
  if (actualStatus === "captured" || Boolean(targetPayment.captured)) {
    // Transition internal payment status to CAPTURED if not already
    if (paymentDoc.status !== "CAPTURED") {
      paymentDoc.status = "CAPTURED";
      paymentDoc.razorpayPaymentId = actualPaymentId;
      paymentDoc.method = targetPayment.method || paymentDoc.method;
      paymentDoc.capturedAt = paymentDoc.capturedAt || new Date();
      await paymentDoc.save();
    } else if (!paymentDoc.razorpayPaymentId) {
      paymentDoc.razorpayPaymentId = actualPaymentId;
      await paymentDoc.save();
    }

    // Authoritative Wallet Crediting via processCapturedPayment
    let creditResult = null;
    try {
      creditResult = await processCapturedPayment({
        internalPaymentId: paymentDoc.internalPaymentId,
        razorpayPaymentId: actualPaymentId,
      });
    } catch (creditErr) {
      paymentDoc.reconciliationLockedUntil = null;
      paymentDoc.reconciliationNotes = `Crediting deferred: ${creditErr.message}`;
      await paymentDoc.save();
      return {
        status: "CREDIT_ERROR",
        internalPaymentId: paymentId,
        error: creditErr.message,
      };
    }

    // Refresh payment to record reconciliation completion
    const refreshedPayment = await PaymentModel.findOne({ internalPaymentId: paymentId });
    if (refreshedPayment) {
      refreshedPayment.reconciliationStatus = "RECONCILED";
      refreshedPayment.reconciledAt = new Date();
      refreshedPayment.reconciliationNotes = "Authoritatively reconciled and credited via reconciliation service.";
      refreshedPayment.reconciliationLockedUntil = null;
      await refreshedPayment.save();
    }

    return {
      status: "RECONCILED_AND_CREDITED",
      internalPaymentId: paymentId,
      razorpayPaymentId: actualPaymentId,
      walletCredited: Boolean(creditResult?.success),
      amountRupees: creditResult?.amountRupees || Math.floor(expectedAmount / 100),
    };
  }

  // 7B. AUTHORIZED: Never credit authorized but uncaptured payments
  if (actualStatus === "authorized") {
    if (paymentDoc.status === "CREATED") {
      paymentDoc.status = "PENDING";
    }
    paymentDoc.razorpayPaymentId = actualPaymentId;
    paymentDoc.method = targetPayment.method || paymentDoc.method;
    paymentDoc.reconciliationNotes = "Payment authorized by user bank; awaiting gateway capture. Wallet not credited.";
    paymentDoc.reconciliationLockedUntil = null;
    await paymentDoc.save();

    return {
      status: "AWAITING_CAPTURE",
      internalPaymentId: paymentId,
      razorpayPaymentId: actualPaymentId,
    };
  }

  // 7C. FAILED: Mark internal record as FAILED
  if (actualStatus === "failed") {
    // Only transition if not previously CAPTURED or CREDITED
    if (paymentDoc.status !== "CAPTURED" && paymentDoc.status !== "CREDITED") {
      paymentDoc.status = "FAILED";
      paymentDoc.razorpayPaymentId = actualPaymentId;
      paymentDoc.failureReason = targetPayment.error_description || "Payment failed at payment gateway.";
      paymentDoc.reconciliationStatus = "RECONCILED";
      paymentDoc.reconciledAt = new Date();
      paymentDoc.reconciliationNotes = `Marked FAILED during reconciliation: ${paymentDoc.failureReason}`;
      paymentDoc.reconciliationLockedUntil = null;
      await paymentDoc.save();

      return {
        status: "RECONCILED_FAILED",
        internalPaymentId: paymentId,
        failureReason: paymentDoc.failureReason,
      };
    }
  }

  // Default fallback: unlock and record note
  paymentDoc.reconciliationLockedUntil = null;
  paymentDoc.reconciliationNotes = `Unhandled gateway status: ${actualStatus}`;
  await paymentDoc.save();

  return { status: "UNHANDLED_STATUS", internalPaymentId: paymentId, gatewayStatus: actualStatus };
};

/**
 * Main reconciliation batch runner.
 *
 * Queries for stale payments in non-terminal states and reconciles each with atomic lease locking.
 *
 * @param {Object} [options]
 * @param {number} [options.staleThresholdMs] - Age in ms before a payment is considered stale
 * @param {number} [options.batchSize] - Maximum payments to process per batch
 * @param {number} [options.lockDurationMs] - Duration of atomic lease lock
 * @param {Object} [options.clientOverride] - Razorpay client override (for testing)
 * @returns {Promise<Object>} Batch summary report
 */
const reconcileStalePayments = async ({
  staleThresholdMs = DEFAULT_STALE_THRESHOLD_MS,
  batchSize = DEFAULT_BATCH_SIZE,
  lockDurationMs = DEFAULT_LOCK_DURATION_MS,
  clientOverride = null,
  filter = {},
} = {}) => {
  const startTime = Date.now();
  const summary = {
    scanned: 0,
    reconciled: 0,
    credited: 0,
    flagged: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    outcomes: [],
  };

  const staleCutoff = new Date(Date.now() - staleThresholdMs);
  const now = new Date();

  // Find candidate payments that are stale and not yet safely CREDITED
  const candidates = await PaymentModel.find({
    status: { $in: ["CREATED", "PENDING", "CAPTURED"] },
    reconciliationStatus: { $ne: "RECONCILED" },
    createdAt: { $lte: staleCutoff },
    $or: [
      { reconciliationLockedUntil: null },
      { reconciliationLockedUntil: { $lte: now } },
    ],
    ...filter,
  })
    .sort({ createdAt: 1 })
    .limit(batchSize);

  summary.scanned = candidates.length;
  if (candidates.length === 0) {
    return { ...summary, durationMs: Date.now() - startTime };
  }

  for (const candidate of candidates) {
    // 1. Acquire atomic lease lock per document
    const leaseExpires = new Date(Date.now() + lockDurationMs);
    const lockedPayment = await PaymentModel.findOneAndUpdate(
      {
        _id: candidate._id,
        status: { $in: ["CREATED", "PENDING", "CAPTURED"] },
        $or: [
          { reconciliationLockedUntil: null },
          { reconciliationLockedUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          reconciliationLockedUntil: leaseExpires,
          reconciliationLastChecked: now,
        },
        $inc: { reconciliationAttempts: 1 },
      },
      { returnDocument: "after" }
    );

    // If lockedPayment is null, another concurrent worker acquired the lease
    if (!lockedPayment) {
      summary.skipped++;
      continue;
    }

    try {
      const outcome = await reconcileSinglePayment(lockedPayment, { clientOverride });
      summary.outcomes.push(outcome);

      if (outcome.status === "RECONCILED_AND_CREDITED") {
        summary.reconciled++;
        if (outcome.walletCredited) summary.credited++;
      } else if (outcome.status === "RECONCILED_FAILED" || outcome.status === "MARKED_ABANDONED") {
        summary.reconciled++;
        summary.failed++;
      } else if (outcome.status && outcome.status.startsWith("FLAGGED")) {
        summary.flagged++;
      } else if (outcome.status && outcome.status.startsWith("SKIPPED")) {
        summary.skipped++;
      }
    } catch (err) {
      summary.errors.push({
        internalPaymentId: candidate.internalPaymentId,
        error: err.message,
      });

      // Release lock on unexpected unhandled exceptions
      await PaymentModel.updateOne(
        { _id: candidate._id },
        {
          $set: {
            reconciliationLockedUntil: null,
            reconciliationNotes: `Reconciliation exception: ${err.message}`,
          },
        }
      );
    }
  }

  summary.durationMs = Date.now() - startTime;
  return summary;
};

/**
 * Starts the periodic reconciliation scheduler.
 * Single process overlap protection via isReconciliationRunning mutex.
 *
 * @param {Object} [options]
 * @param {number} [options.intervalMs] - Polling interval in ms (default: 5 minutes)
 * @param {number} [options.staleThresholdMs] - Age threshold in ms (default: 10 minutes)
 * @param {number} [options.batchSize] - Batch size (default: 25)
 * @param {Object} [options.clientOverride] - Razorpay client override (for testing)
 * @returns {NodeJS.Timeout} Active timer instance
 */
const startReconciliationScheduler = ({
  intervalMs = 5 * 60 * 1000,
  staleThresholdMs = DEFAULT_STALE_THRESHOLD_MS,
  batchSize = DEFAULT_BATCH_SIZE,
  clientOverride = null,
} = {}) => {
  if (schedulerTimer) {
    console.log("[Reconciliation Scheduler] Already running.");
    return schedulerTimer;
  }

  console.log(
    `[Reconciliation Scheduler] Started (Interval: ${intervalMs / 1000}s, Stale Threshold: ${
      staleThresholdMs / 1000
    }s, Batch: ${batchSize})`
  );

  const runJob = async () => {
    // Only execute if MongoDB is currently in connected state
    const mongoose = require("mongoose");
    if (mongoose.connection?.readyState !== 1) {
      return;
    }

    if (isReconciliationRunning) {
      console.log("[Reconciliation Scheduler] Previous run still in progress; skipping cycle.");
      return;
    }

    isReconciliationRunning = true;
    try {
      const summary = await reconcileStalePayments({
        staleThresholdMs,
        batchSize,
        clientOverride,
      });

      // Also reconcile any stale in-flight pending refunds
      try {
        await reconcilePendingRefunds({
          staleThresholdMs,
          clientOverride,
        });
      } catch (refundRecErr) {
        console.warn("[Reconciliation Scheduler] Pending refund recovery warning:", refundRecErr.message);
      }
      if (summary.scanned > 0) {
        console.log("[Reconciliation Scheduler] Run completed:", {
          scanned: summary.scanned,
          reconciled: summary.reconciled,
          credited: summary.credited,
          flagged: summary.flagged,
          failed: summary.failed,
          skipped: summary.skipped,
          durationMs: summary.durationMs,
        });
      }
    } catch (jobErr) {
      console.error("[Reconciliation Scheduler] Run error:", jobErr);
    } finally {
      isReconciliationRunning = false;
    }
  };

  // Run initial pass after slight delay, then on interval
  initialTimeout = setTimeout(runJob, 5000);
  schedulerTimer = setInterval(runJob, intervalMs);
  return schedulerTimer;
};

/**
 * Stops the periodic reconciliation scheduler cleanly.
 */
const stopReconciliationScheduler = () => {
  if (initialTimeout) {
    clearTimeout(initialTimeout);
    initialTimeout = null;
  }
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  isReconciliationRunning = false;
  console.log("[Reconciliation Scheduler] Stopped.");
};

/**
 * Query reconciliation status for an internal payment or order.
 *
 * @param {string} identifier - Internal payment ID or Razorpay Order ID
 * @returns {Promise<Object>} Reconciliation status details
 */
const getPaymentReconciliationDetails = async (identifier) => {
  if (!identifier) return null;

  const payment = await PaymentModel.findOne({
    $or: [
      { internalPaymentId: identifier },
      { razorpayOrderId: identifier },
      { razorpayPaymentId: identifier },
    ],
  });

  if (!payment) return null;

  return {
    internalPaymentId: payment.internalPaymentId,
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: payment.razorpayPaymentId,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    reconciliationStatus: payment.reconciliationStatus,
    reconciledAt: payment.reconciledAt,
    reconciliationAttempts: payment.reconciliationAttempts,
    reconciliationLastChecked: payment.reconciliationLastChecked,
    reconciliationNotes: payment.reconciliationNotes,
    createdAt: payment.createdAt,
    creditedAt: payment.creditedAt,
  };
};

module.exports = {
  reconcileSinglePayment,
  reconcileStalePayments,
  reconcilePendingRefunds,
  startReconciliationScheduler,
  stopReconciliationScheduler,
  getPaymentReconciliationDetails,
  DEFAULT_STALE_THRESHOLD_MS,
  DEFAULT_LOCK_DURATION_MS,
  DEFAULT_BATCH_SIZE,
};
