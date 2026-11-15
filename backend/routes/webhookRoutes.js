const router = require("express").Router();
const { handleRazorpayWebhook } = require("../controllers/WebhookController");

/**
 * Razorpay Webhook Route
 * Base path: /api/webhooks
 */

// POST /api/webhooks/razorpay
router.post("/razorpay", handleRazorpayWebhook);

module.exports = router;

