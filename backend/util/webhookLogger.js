/**
 * Dedicated Structured Observability Logger for Razorpay Webhooks.
 *
 * Requirements:
 * 1. Real-time structured JSON logs with consistent prefix '[RazorpayWebhook]'.
 * 2. Emits via console.error for errors, console.warn for warnings/duplicates, console.log for normal lifecycle.
 * 3. Strictly redaction-safe: never logs raw payloads, signatures, webhook secrets, card numbers, or PII.
 * 4. Provides listener hook for testing and verification without mutating log output.
 */

let activeLogListener = null;

/**
 * Sensitive field patterns to strictly redact.
 */
const SENSITIVE_KEY_PATTERN = /secret|signature|rawbody|cvv|otp|card|token|auth|password|email|contact|phone/i;

const sanitizeEntry = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const sanitized = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      sanitized[k] = "[REDACTED]";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      sanitized[k] = sanitizeEntry(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
};

/**
 * Logs a structured webhook event to stdout/stderr.
 *
 * @param {Object} options
 * @param {'info'|'warn'|'error'} options.level - Log level
 * @param {string} options.stage - Lifecycle stage
 * @param {string} [options.eventType] - Razorpay event type
 * @param {string} [options.eventId] - Razorpay event ID
 * @param {string} [options.paymentId] - Related payment ID
 * @param {string} [options.refundId] - Related refund ID
 * @param {string} [options.status] - Processing status
 * @param {string} options.message - Concise human-readable message
 * @param {string} [options.errorCode] - Sanitized error code
 * @param {Error|string} [options.error] - Sanitized error message or Error object
 * @returns {Object} Structured log entry object
 */
const logWebhook = ({
  level = "info",
  stage,
  eventType = null,
  eventId = null,
  paymentId = null,
  refundId = null,
  status = null,
  message,
  errorCode = null,
  error = null,
  ...extra
}) => {
  const sanitizedExtra = sanitizeEntry(extra);

  let sanitizedError = null;
  if (error) {
    sanitizedError = typeof error === "string" ? error : error.message || String(error);
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    stage,
    ...(eventType ? { eventType } : {}),
    ...(eventId ? { eventId } : {}),
    ...(paymentId ? { paymentId } : {}),
    ...(refundId ? { refundId } : {}),
    ...(status ? { status } : {}),
    message,
    ...(errorCode ? { errorCode } : {}),
    ...(sanitizedError ? { error: sanitizedError } : {}),
    ...sanitizedExtra,
  };

  const formattedLine = `[RazorpayWebhook] ${JSON.stringify(entry)}`;

  if (typeof activeLogListener === "function") {
    try {
      activeLogListener(entry, formattedLine);
    } catch (e) {
      // Ignore listener failures
    }
  }

  if (level === "error") {
    console.error(formattedLine);
  } else if (level === "warn") {
    console.warn(formattedLine);
  } else {
    console.log(formattedLine);
  }

  return entry;
};

/**
 * Registers an ephemeral log listener for testing/QA passes.
 */
const setLogListener = (listener) => {
  activeLogListener = listener;
};

const clearLogListener = () => {
  activeLogListener = null;
};

module.exports = {
  logWebhook,
  setLogListener,
  clearLogListener,
};

