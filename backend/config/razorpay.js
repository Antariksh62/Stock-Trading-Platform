const Razorpay = require("razorpay");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config();

/**
 * Dedicated Razorpay Configuration Module (Strictly Test Mode)
 *
 * Requirements:
 * 1. Read Test credentials from environment variables (supports both RAZORPAY_KEY_ID / RAZORPAY_TEST_API_KEY).
 * 2. Validate configuration at startup.
 * 3. Enforce Test Mode (reject any rzp_live_ keys) to ensure live and test environments cannot be confused.
 * 4. Never expose secret keys to the client.
 * 5. Provide timing-safe checkout signature verification.
 */

const getRazorpayCredentials = () => {
  const keyId =
    process.env.RAZORPAY_KEY_ID ||
    process.env.RAZORPAY_TEST_API_KEY ||
    null;

  const keySecret =
    process.env.RAZORPAY_KEY_SECRET ||
    process.env.RAZORPAY_TEST_KEY_SECRET ||
    null;

  const webhookSecret =
    process.env.RAZORPAY_WEBHOOK_SECRET ||
    null;

  return { keyId, keySecret, webhookSecret };
};

const validateRazorpayConfig = ({ throwOnMissing = false } = {}) => {
  const { keyId, keySecret, webhookSecret } = getRazorpayCredentials();
  const errors = [];

  if (!keyId) {
    errors.push("Missing RAZORPAY_KEY_ID (or RAZORPAY_TEST_API_KEY) in environment variables.");
  } else if (!keyId.startsWith("rzp_test_")) {
    errors.push(
      `SECURITY ERROR: Detected non-test key prefix '${keyId.slice(0, 9)}...'. This platform is strictly an educational paper-trading simulator. Live Mode ('rzp_live_') is strictly prohibited. You must use a Razorpay Test Mode key starting with 'rzp_test_'.`
    );
  }

  if (!keySecret) {
    errors.push("Missing RAZORPAY_KEY_SECRET (or RAZORPAY_TEST_KEY_SECRET) in environment variables.");
  }

  if (errors.length > 0) {
    const errorMsg = `[Razorpay Config Error]\n - ${errors.join("\n - ")}`;
    if (throwOnMissing) {
      throw new Error(errorMsg);
    }
    console.warn(`\n⚠️  ${errorMsg}\n`);
    return {
      isValid: false,
      errors,
      keyId: null,
      isTestMode: false,
      hasWebhookSecret: Boolean(webhookSecret),
    };
  }

  return {
    isValid: true,
    errors: [],
    keyId,
    isTestMode: true,
    hasWebhookSecret: Boolean(webhookSecret),
  };
};

// Initialize SDK instance with test credentials
const { keyId, keySecret, webhookSecret } = getRazorpayCredentials();

let razorpayClient = null;
if (keyId && keySecret && keyId.startsWith("rzp_test_")) {
  razorpayClient = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

/**
 * Public configuration safe for delivery to client/dashboard.
 * NEVER returns keySecret or webhookSecret.
 */
const getPublicRazorpayConfig = () => {
  const { keyId } = getRazorpayCredentials();
  return {
    keyId: keyId && keyId.startsWith("rzp_test_") ? keyId : null,
    currency: "INR",
    isTestMode: true,
  };
};

/**
 * Verifies Razorpay checkout signature using HMAC-SHA256 and constant-time comparison.
 * Signature calculation: HMAC-SHA256(orderId + "|" + paymentId, keySecret)
 *
 * @param {Object} params
 * @param {string} params.orderId - Razorpay order ID (e.g. order_xxx)
 * @param {string} params.paymentId - Razorpay payment ID (e.g. pay_xxx)
 * @param {string} params.signature - Signature hex string from client callback
 * @param {string} [params.customKeySecret] - Optional key secret override (uses env secret by default)
 * @returns {boolean} True if signature is cryptographically valid
 */
const verifyCheckoutSignature = ({
  orderId,
  paymentId,
  signature,
  customKeySecret = null,
}) => {
  const secret = customKeySecret || getRazorpayCredentials().keySecret;

  if (!orderId || !paymentId || !signature || !secret) {
    return false;
  }

  // Razorpay HMAC-SHA256 hex signatures are strictly 64 characters [a-f0-9]
  if (
    typeof signature !== "string" ||
    signature.length !== 64 ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  try {
    const payload = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const providedBuffer = Buffer.from(signature, "utf8");

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch (err) {
    return false;
  }
};

/**
 * Verifies Razorpay Webhook signature using HMAC-SHA256 of original raw request body.
 * Signature calculation: HMAC-SHA256(raw_body, webhookSecret)
 *
 * @param {Object} params
 * @param {Buffer|string} params.rawBody - Raw unmodified HTTP request body
 * @param {string} params.signature - Signature hex string from 'x-razorpay-signature' header
 * @param {string} [params.customWebhookSecret] - Optional webhook secret override
 * @returns {boolean} True if signature is cryptographically valid
 */
const verifyWebhookSignature = ({
  rawBody,
  signature,
  customWebhookSecret = null,
}) => {
  const secret = customWebhookSecret || getRazorpayCredentials().webhookSecret;

  if (!rawBody || !signature || !secret) {
    return false;
  }

  // Razorpay HMAC-SHA256 hex signatures are strictly 64 characters [a-f0-9]
  if (
    typeof signature !== "string" ||
    signature.length !== 64 ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  try {
    const payload = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(rawBody, "utf8");

    const expectedHex = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedHex, "hex");
    const providedBuffer = Buffer.from(signature, "hex");

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch (err) {
    return false;
  }
};

module.exports = {
  razorpayClient,
  validateRazorpayConfig,
  getRazorpayCredentials,
  getPublicRazorpayConfig,
  verifyCheckoutSignature,
  verifyWebhookSignature,
};

