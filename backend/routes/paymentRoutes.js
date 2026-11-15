const router = require("express").Router();
const { requireAuth } = require("../middlewares/requireAuth");
const {
  createOrder,
  verifyOrder,
  getTransactionHistory,
  getPaymentStatus,
  createRefund,
  getRefunds,
} = require("../controllers/PaymentController");

/**
 * Payment Routes
 * Base path: /api/payments
 */

// POST /api/payments/create-order
// Authenticated route to generate Razorpay test order
router.post("/create-order", requireAuth, createOrder);

// POST /api/payments/verify
// Authenticated route to verify Razorpay checkout signature and capture status
router.post("/verify", requireAuth, verifyOrder);

// POST /api/payments/refund
// Authenticated route to initiate a controlled refund for a payment
router.post("/refund", requireAuth, createRefund);

// GET /api/payments/refunds/:paymentIdentifier
// Authenticated route to fetch auditable refund history for a payment
router.get("/refunds/:paymentIdentifier", requireAuth, getRefunds);

// GET /api/payments/status/:orderId
// Authenticated route to safely query the authoritative status of a payment
router.get("/status/:orderId", requireAuth, getPaymentStatus);

// GET /api/payments/transactions
// Authenticated route to retrieve paginated wallet transaction ledger
router.get("/transactions", requireAuth, getTransactionHistory);

module.exports = router;
