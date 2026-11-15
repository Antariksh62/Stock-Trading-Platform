const {
  createPaymentOrder,
  verifyPayment,
  getPaymentStatus: getPaymentStatusService,
  getUserTransactionHistory,
} = require("../services/paymentService");
const {
  initiatePaymentRefund,
  getPaymentRefundHistory,
} = require("../services/paymentRefundService");

/**
 * Controller for POST /api/payments/create-order
 *
 * Requirements:
 * 1. Strictly relies on req.userId set by requireAuth middleware.
 * 2. Accepts amount in INR (whole rupees).
 * 3. Supports idempotencyKey via header (x-idempotency-key) or body.
 * 4. Returns 201 for freshly created orders, 200 for idempotent duplicates.
 * 5. Returns 400 for validation errors, 502/503 for gateway issues, 500 for server errors.
 * 6. Never leaks API secrets or backend stack traces.
 */
const createOrder = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User session is required to initiate payments.",
      });
    }

    const { amount, idempotencyKey: bodyIdempotencyKey, notes } = req.body || {};
    const idempotencyKey =
      req.headers["x-idempotency-key"] || bodyIdempotencyKey || null;

    if (amount === undefined || amount === null) {
      return res.status(400).json({
        success: false,
        message: "Payment 'amount' in INR is required.",
      });
    }

    const result = await createPaymentOrder({
      userId,
      amountRupees: Number(amount),
      idempotencyKey,
      notes,
    });

    const statusCode = result.isDuplicate ? 200 : 201;

    return res.status(statusCode).json({
      success: true,
      isDuplicate: result.isDuplicate,
      message: result.isDuplicate
        ? "Existing payment order returned (idempotent request)."
        : "Payment order created successfully.",
      ...result.order,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    let message = error.message || "Failed to create payment order.";
    if (statusCode === 500) {
      message = "An internal server error occurred while initiating payment.";
    }

    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

/**
 * Controller for POST /api/payments/verify
 *
 * Requirements:
 * 1. Strictly relies on req.userId set by requireAuth middleware.
 * 2. Accepts razorpay_order_id, razorpay_payment_id, razorpay_signature.
 * 3. Validates HMAC-SHA256 signature using timingSafeEqual.
 * 4. Validates user ownership and order consistency.
 * 5. Fetches live payment status from Razorpay SDK to confirm capture status.
 * 6. Safely handles CREDITED, CAPTURED, PENDING, and FAILED states.
 * 7. Never leaks secret keys or stack traces.
 */
const verifyOrder = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User session is required to verify payments.",
      });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body || {};

    const result = await verifyPayment({
      userId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    return res.status(200).json(result.order);
  } catch (error) {
    const statusCode = error.statusCode || 500;

    if (error.paymentDetails) {
      return res.status(statusCode).json(error.paymentDetails);
    }

    let message = error.message || "Payment verification failed.";
    if (statusCode === 500) {
      message = "An internal server error occurred during payment verification.";
    } else if (statusCode === 502 || statusCode === 504) {
      message = error.message || "Payment gateway communication failure or timeout.";
    }

    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

/**
 * Controller for GET /api/payments/transactions
 *
 * Requirements:
 * 1. Strictly relies on req.userId set by requireAuth middleware.
 * 2. Supports limit & page query parameters.
 * 3. Returns transactions sorted newest first.
 * 4. Never exposes another user's transactions.
 */
const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User session is required to fetch transactions.",
      });
    }

    const { page, limit, type } = req.query || {};

    const history = await getUserTransactionHistory({
      userId,
      page,
      limit,
      type,
    });

    return res.status(200).json(history);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to fetch transaction history.",
    });
  }
};

/**
 * Controller for GET /api/payments/status/:orderId
 *
 * Requirements:
 * 1. Strictly relies on req.userId set by requireAuth middleware.
 * 2. Accepts orderId parameter (razorpayOrderId or internalPaymentId).
 * 3. Enforces strict ownership check.
 * 4. Queries authoritative Razorpay status when pending.
 * 5. Reconciles and credits wallet if gateway reports captured.
 */
const getPaymentStatus = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User session is required to check payment status.",
      });
    }

    const { orderId } = req.params || {};

    const result = await getPaymentStatusService({
      userId,
      orderId,
    });

    return res.status(200).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to fetch payment status.",
    });
  }
};

/**
 * Controller for POST /api/payments/refund
 *
 * Requirements:
 * 1. Strictly relies on req.userId set by requireAuth middleware.
 * 2. Validates ownership (cannot refund another user's payment).
 * 3. Supports partial and full refunds.
 * 4. Safe wallet accounting (does not force negative balance).
 * 5. Returns 200 on success, 400 for invalid/duplicate requests, 403 for cross-user attempts.
 */
const createRefund = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User session is required to initiate a refund.",
      });
    }

    const {
      payment_id,
      order_id,
      paymentId,
      orderId,
      amount,
      amountPaise,
      amountRupees,
      reason,
      idempotency_key,
      idempotencyKey,
      deduct_from_wallet,
      deductFromWallet,
    } = req.body || {};

    const paymentIdentifier = payment_id || order_id || paymentId || orderId;
    if (!paymentIdentifier) {
      return res.status(400).json({
        success: false,
        message: "Payment identifier (payment_id or order_id) is required.",
      });
    }

    // Determine amount in paise
    let targetAmountPaise = null;
    if (amountPaise !== undefined) {
      targetAmountPaise = amountPaise;
    } else if (amount !== undefined) {
      targetAmountPaise = amount;
    } else if (amountRupees !== undefined) {
      targetAmountPaise = Math.round(Number(amountRupees) * 100);
    }

    const idempotency =
      idempotency_key || idempotencyKey || req.headers["x-idempotency-key"] || null;
    const shouldDeduct =
      deduct_from_wallet !== undefined
        ? Boolean(deduct_from_wallet)
        : deductFromWallet !== undefined
        ? Boolean(deductFromWallet)
        : false;

    const result = await initiatePaymentRefund({
      userId,
      paymentIdentifier,
      amount: targetAmountPaise,
      reason,
      idempotencyKey: idempotency,
      deductFromWallet: shouldDeduct,
    });

    return res.status(200).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to process refund.",
    });
  }
};

/**
 * Controller for GET /api/payments/refunds/:paymentIdentifier
 */
const getRefunds = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User session is required to view refunds.",
      });
    }

    const paymentIdentifier =
      req.params.paymentIdentifier || req.query.paymentId || req.query.orderId;
    if (!paymentIdentifier) {
      return res.status(400).json({
        success: false,
        message: "Payment identifier is required.",
      });
    }

    const result = await getPaymentRefundHistory({
      userId,
      paymentIdentifier,
    });

    return res.status(200).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to fetch refund details.",
    });
  }
};

module.exports = {
  createOrder,
  verifyOrder,
  getTransactionHistory,
  getPaymentStatus,
  createRefund,
  getRefunds,
};
