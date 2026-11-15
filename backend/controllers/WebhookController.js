const { receiveAndProcessWebhook } = require("../services/webhookService");
const { logWebhook } = require("../util/webhookLogger");

/**
 * Controller for POST /api/webhooks/razorpay
 *
 * Public endpoint consumed by Razorpay Webhook notification service.
 * Authentic origin is strictly validated via cryptographic HMAC-SHA256 signature.
 */
const handleRazorpayWebhook = async (req, res) => {
  const rawBody = req.rawBody || req.body;
  const signature = req.headers["x-razorpay-signature"];
  const eventIdHeader = req.headers["x-razorpay-event-id"];

  logWebhook({
    level: "info",
    stage: "incoming_request",
    eventId: eventIdHeader || undefined,
    message: "Incoming Razorpay webhook HTTP request received.",
  });

  try {
    const result = await receiveAndProcessWebhook({
      rawBody,
      signature,
      eventIdHeader,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500
        ? error.message || "An unexpected error occurred while processing webhook."
        : error.message;

    logWebhook({
      level: "error",
      stage: "request_error",
      eventId: eventIdHeader || undefined,
      errorCode: `HTTP_${statusCode}`,
      error,
      message: `Webhook request failed: ${error.message}`,
    });

    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

module.exports = {
  handleRazorpayWebhook,
};

