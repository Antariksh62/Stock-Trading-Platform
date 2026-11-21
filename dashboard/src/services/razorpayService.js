import axios from "axios";
import { API_BASE, RAZORPAY_KEY_ID } from "../config";

let scriptLoadingPromise = null;

/**
 * Safely loads the Razorpay Checkout script dynamically.
 * Idempotent: Avoids duplicate script tags and handles concurrent requests.
 *
 * @returns {Promise<boolean>} Resolves to true when window.Razorpay is ready.
 */
export const loadRazorpayScript = () => {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  // If already loaded on window, resolve immediately
  if (window.Razorpay) {
    return Promise.resolve(true);
  }

  // If script is currently loading, return the in-flight Promise
  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise((resolve, reject) => {
    // Check if script element already exists in document
    const existingScript = document.getElementById("razorpay-checkout-script");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(true));
      existingScript.addEventListener("error", () => {
        scriptLoadingPromise = null;
        reject(new Error("Failed to load Razorpay Checkout script."));
      });
      return;
    }

    const script = document.createElement("script");
    script.id = "razorpay-checkout-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;

    script.onload = () => {
      resolve(true);
    };

    script.onerror = () => {
      scriptLoadingPromise = null;
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      reject(new Error("Unable to connect to Razorpay payment gateway. Please check your internet connection."));
    };

    document.body.appendChild(script);
  });

  return scriptLoadingPromise;
};

/**
 * Helper to ensure a valid session token exists in client storage.
 * If user is exploring in Trial Mode without a prior signup, automatically
 * initializes an authenticated trial session so Razorpay test orders can be created.
 */
export const ensureSessionToken = async () => {
  if (typeof localStorage === "undefined") return null;
  let token = localStorage.getItem("token");
  if (token) return token;

  try {
    const guestNonce = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const guestRes = await axios.post(`${API_BASE}/signup`, {
      username: `Trial User`,
      email: `guest_${guestNonce}@trial.zerodha.com`,
      password: `Trial_${guestNonce}!Pass`,
    });
    if (guestRes.data && guestRes.data.token) {
      token = guestRes.data.token;
      localStorage.setItem("token", token);
      localStorage.setItem(
        "user",
        JSON.stringify({
          id: guestRes.data.user?.id || guestRes.data.user?._id,
          username: "GUEST TRIAL",
          email: guestRes.data.user?.email,
          isGuestTrial: true,
        })
      );
      return token;
    }
  } catch (err) {
    console.warn("Guest trial token auto-provision notice:", err.message);
  }
  return null;
};

/**
 * Helper to get authorization headers and active user identity from client storage.
 */
export const getAuthHeaders = () => {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  const headers = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return {
    headers,
    withCredentials: true,
  };
};

/**
 * Calls backend POST /api/payments/create-order
 *
 * @param {Object} params
 * @param {number} params.amount - Whole rupees to deposit
 * @param {string} [params.idempotencyKey] - Unique key to prevent double charging
 * @returns {Promise<Object>} Order creation response
 */
export const createPaymentOrderApi = async ({ amount, idempotencyKey }) => {
  const numAmount = Number(amount);
  if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
    throw new Error("Please enter a valid positive deposit amount.");
  }
  if (!Number.isInteger(numAmount)) {
    throw new Error("Deposit amount must be a whole rupee value.");
  }
  if (numAmount < 100) {
    throw new Error("Minimum deposit amount is ₹100.");
  }
  if (numAmount > 100000) {
    throw new Error("Maximum deposit limit is ₹1,00,000 per transaction.");
  }

  await ensureSessionToken();
  const config = getAuthHeaders();
  if (idempotencyKey) {
    config.headers["x-idempotency-key"] = idempotencyKey;
  }

  const payload = {
    amount: numAmount,
    idempotencyKey,
  };

  const response = await axios.post(`${API_BASE}/api/payments/create-order`, payload, config);
  return response.data;
};

/**
 * Calls backend POST /api/payments/verify
 *
 * @param {Object} params
 * @param {string} params.razorpay_order_id - Razorpay order ID
 * @param {string} params.razorpay_payment_id - Razorpay payment ID
 * @param {string} params.razorpay_signature - Cryptographic signature from Checkout
 * @returns {Promise<Object>} Verification response
 */
export const verifyPaymentOrderApi = async ({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) => {
  const config = getAuthHeaders();
  const payload = {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  };

  const response = await axios.post(`${API_BASE}/api/payments/verify`, payload, config);
  return response.data;
};

/**
 * Calls backend GET /api/payments/transactions to fetch paginated ledger history.
 *
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.type] - Optional filter ('DEPOSIT' | 'WITHDRAWAL')
 * @returns {Promise<Object>} Paginated transaction history
 */
export const fetchTransactionHistoryApi = async ({
  page = 1,
  limit = 10,
  type = null,
} = {}) => {
  await ensureSessionToken();
  const config = getAuthHeaders();
  const params = { page, limit };
  if (type) params.type = type;
  config.params = { ...config.params, ...params };

  const response = await axios.get(`${API_BASE}/api/payments/transactions`, config);
  return response.data;
};

/**
 * Calls backend GET /api/payments/status/:orderId
 *
 * @param {string} orderId - Razorpay order ID or internal payment ID
 * @returns {Promise<Object>} Authoritative payment status
 */
export const checkPaymentStatusApi = async (orderId) => {
  if (!orderId) {
    throw new Error("Order ID is required to check payment status.");
  }
  const config = getAuthHeaders();
  const response = await axios.get(
    `${API_BASE}/api/payments/status/${encodeURIComponent(orderId)}`,
    config
  );
  return response.data;
};

/**
 * Opens the official Razorpay Checkout modal with pre-configured parameters.
 *
 * @param {Object} params
 * @param {Object} params.order - Backend order payload (orderId, amount, currency, keyId)
 * @param {Object} [params.user] - Optional user details for prefill (name, email)
 * @param {Function} params.onSuccess - Callback on payment success
 * @param {Function} params.onFailure - Callback on payment failure
 * @param {Function} params.onDismiss - Callback when user closes checkout without paying
 * @returns {Object} Razorpay instance
 */
export const openRazorpayCheckout = ({
  order,
  user = {},
  onSuccess,
  onFailure,
  onDismiss,
}) => {
  if (typeof window === "undefined" || !window.Razorpay) {
    throw new Error("Razorpay Checkout SDK is not loaded.");
  }

  const resolvedKey = order.keyId || RAZORPAY_KEY_ID;
  if (!resolvedKey) {
    throw new Error("Razorpay Key ID is not configured. Please set VITE_RAZORPAY_KEY_ID in environment.");
  }

  const options = {
    key: resolvedKey,
    amount: order.amount, // in paise
    currency: order.currency || "INR",
    name: "Zerodha Trading Platform",
    description: `Wallet Deposit (Order #${order.orderId || order.internalPaymentId})`,
    order_id: order.orderId,
    prefill: {
      name: user.name || user.username || "",
      email: user.email || "",
    },
    notes: {
      internalPaymentId: order.internalPaymentId,
      platform: "Zerodha Paper Trading",
    },
    theme: {
      color: "#387ed1",
    },
    handler: function (response) {
      if (typeof onSuccess === "function") {
        onSuccess(response);
      }
    },
    modal: {
      ondismiss: function () {
        if (typeof onDismiss === "function") {
          onDismiss();
        }
      },
      escape: true,
      backdropclose: false,
    },
  };

  const rzp = new window.Razorpay(options);

  rzp.on("payment.failed", function (response) {
    if (typeof onFailure === "function") {
      onFailure(response.error || { description: "Payment was declined by the bank." });
    }
  });

  rzp.open();
  return rzp;
};

