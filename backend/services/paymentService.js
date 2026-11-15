const crypto = require("crypto");
const { PaymentModel } = require("../model/PaymentModel");
const { WalletTransactionModel } = require("../model/WalletTransactionModel");
const {
  razorpayClient,
  getPublicRazorpayConfig,
  verifyCheckoutSignature,
} = require("../config/razorpay");
const { acquireUserLock, releaseUserLock } = require("./orderExecutionService");
const { processCapturedPayment } = require("./paymentProcessingService");

// Transaction limits in INR (Rupees)
const MIN_DEPOSIT_RUPEES = 100;
const MAX_DEPOSIT_RUPEES = 100000;

/**
 * Validates deposit amount in INR.
 * Must be a positive integer within allowable limits.
 */
const validateDepositAmount = (amountRupees) => {
  if (
    typeof amountRupees !== "number" ||
    !Number.isInteger(amountRupees) ||
    isNaN(amountRupees)
  ) {
    return {
      isValid: false,
      message: "Deposit amount must be a valid whole number (integer) in INR.",
    };
  }

  if (amountRupees < MIN_DEPOSIT_RUPEES) {
    return {
      isValid: false,
      message: `Minimum deposit amount is ₹${MIN_DEPOSIT_RUPEES}.`,
    };
  }

  if (amountRupees > MAX_DEPOSIT_RUPEES) {
    return {
      isValid: false,
      message: `Maximum deposit amount per transaction is ₹${MAX_DEPOSIT_RUPEES.toLocaleString(
        "en-IN"
      )}.`,
    };
  }

  return { isValid: true };
};

/**
 * Creates a Razorpay payment order for an authenticated user.
 *
 * @param {Object} params
 * @param {string} params.userId - Authenticated user ID (from token)
 * @param {number} params.amountRupees - Amount in INR (integer)
 * @param {string} [params.idempotencyKey] - Optional client idempotency key
 * @param {Object} [params.notes] - Optional non-sensitive metadata
 * @returns {Promise<Object>} Created or existing order details
 */
const createPaymentOrder = async ({
  userId,
  amountRupees,
  idempotencyKey = null,
  notes = {},
}) => {
  if (!userId) {
    const error = new Error("User ID is required.");
    error.statusCode = 401;
    throw error;
  }

  // 1. Amount validation
  const validation = validateDepositAmount(amountRupees);
  if (!validation.isValid) {
    const error = new Error(validation.message);
    error.statusCode = 400;
    throw error;
  }

  // Convert INR to integer paise (1 INR = 100 paise)
  const amountPaise = amountRupees * 100;

  // Sanitize idempotency key
  const sanitizedIdempotencyKey =
    typeof idempotencyKey === "string" && idempotencyKey.trim().length > 0
      ? idempotencyKey.trim()
      : null;

  // 2. Early Idempotency Check (read-only before lock)
  if (sanitizedIdempotencyKey) {
    const existingPayment = await PaymentModel.findOne({
      userId: String(userId),
      idempotencyKey: sanitizedIdempotencyKey,
    });

    if (existingPayment) {
      const publicConfig = getPublicRazorpayConfig();
      return {
        isDuplicate: true,
        order: {
          internalPaymentId: existingPayment.internalPaymentId,
          orderId: existingPayment.razorpayOrderId,
          keyId: publicConfig.keyId,
          amount: existingPayment.amount,
          amountRupees: Math.floor(existingPayment.amount / 100),
          currency: existingPayment.currency,
          status: existingPayment.status,
        },
      };
    }
  }

  // 3. Serialized execution per user to prevent concurrent double order creation
  await acquireUserLock(String(userId));

  try {
    // Re-check idempotency key under lock
    if (sanitizedIdempotencyKey) {
      const existingPayment = await PaymentModel.findOne({
        userId: String(userId),
        idempotencyKey: sanitizedIdempotencyKey,
      });

      if (existingPayment) {
        const publicConfig = getPublicRazorpayConfig();
        return {
          isDuplicate: true,
          order: {
            internalPaymentId: existingPayment.internalPaymentId,
            orderId: existingPayment.razorpayOrderId,
            keyId: publicConfig.keyId,
            amount: existingPayment.amount,
            amountRupees: Math.floor(existingPayment.amount / 100),
            currency: existingPayment.currency,
            status: existingPayment.status,
          },
        };
      }
    }

    // 4. Verify Razorpay client readiness
    if (!razorpayClient) {
      const error = new Error(
        "Payment gateway is currently unavailable. Razorpay configuration is incomplete or inactive."
      );
      error.statusCode = 503;
      throw error;
    }

    const publicConfig = getPublicRazorpayConfig();
    if (!publicConfig.keyId) {
      const error = new Error(
        "Payment gateway test credentials not configured."
      );
      error.statusCode = 503;
      throw error;
    }

    // 5. Generate internal payment ID (length ~24 chars, fits Razorpay 40-char limit)
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
    const internalPaymentId = `PAY_${timestamp}_${randomHex}`;

    // 6. Call Razorpay SDK to create the order
    let rzpOrder;
    try {
      const rzpOptions = {
        amount: amountPaise,
        currency: "INR",
        receipt: internalPaymentId,
        notes: {
          userId: String(userId),
          internalPaymentId,
          purpose: "WALLET_DEPOSIT",
          ...(notes && typeof notes === "object" ? notes : {}),
        },
      };

      rzpOrder = await razorpayClient.orders.create(rzpOptions);
    } catch (rzpErr) {
      console.error("[Razorpay API Error]:", {
        message: rzpErr.message,
        statusCode: rzpErr.statusCode,
      });

      const error = new Error(
        rzpErr.error?.description ||
          rzpErr.message ||
          "Failed to create order with payment gateway."
      );
      error.statusCode = rzpErr.statusCode || 502;
      throw error;
    }

    if (!rzpOrder || !rzpOrder.id) {
      const error = new Error(
        "Payment gateway returned an invalid order response."
      );
      error.statusCode = 502;
      throw error;
    }

    // 7. Persist Payment Record in MongoDB
    const paymentData = {
      userId: String(userId),
      internalPaymentId,
      razorpayOrderId: rzpOrder.id,
      amount: amountPaise,
      currency: "INR",
      status: "CREATED",
    };
    if (sanitizedIdempotencyKey) {
      paymentData.idempotencyKey = sanitizedIdempotencyKey;
    }

    const paymentRecord = await PaymentModel.create(paymentData);

    return {
      isDuplicate: false,
      order: {
        internalPaymentId: paymentRecord.internalPaymentId,
        orderId: paymentRecord.razorpayOrderId,
        keyId: publicConfig.keyId,
        amount: paymentRecord.amount,
        amountRupees,
        currency: paymentRecord.currency,
        status: paymentRecord.status,
      },
    };
  } finally {
    releaseUserLock(String(userId));
  }
};

/**
 * Verifies Razorpay Checkout payment for an authenticated user.
 *
 * Procedure:
 * 1. Validate required fields (order ID, payment ID, signature).
 * 2. Locate internal payment record and verify user ownership (payment.userId === userId).
 * 3. Check for already completed states (CREDITED / CAPTURED) for idempotency.
 * 4. Verify cryptographic signature: HMAC-SHA256(order_id + "|" + payment_id, secret) with timingSafeEqual.
 * 5. Fetch live payment from Razorpay API to confirm capture status, amount, and order ID.
 * 6. Execute state transitions atomically under user lock.
 *
 * @param {Object} params
 * @param {string} params.userId - Verified user ID from JWT
 * @param {string} params.razorpayOrderId - Razorpay Order ID (order_xxx)
 * @param {string} params.razorpayPaymentId - Razorpay Payment ID (pay_xxx)
 * @param {string} params.razorpaySignature - Signature from client checkout callback
 * @returns {Promise<Object>} Verification result
 */
const verifyPayment = async ({
  userId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) => {
  if (!userId) {
    const error = new Error("User ID is required.");
    error.statusCode = 401;
    throw error;
  }

  // 1. Validate required fields
  if (
    !razorpayOrderId ||
    typeof razorpayOrderId !== "string" ||
    !razorpayPaymentId ||
    typeof razorpayPaymentId !== "string" ||
    !razorpaySignature ||
    typeof razorpaySignature !== "string"
  ) {
    const error = new Error(
      "Missing required payment verification fields (razorpay_order_id, razorpay_payment_id, razorpay_signature)."
    );
    error.statusCode = 400;
    throw error;
  }

  const cleanOrderId = razorpayOrderId.trim();
  const cleanPaymentId = razorpayPaymentId.trim();
  const cleanSignature = razorpaySignature.trim();

  // 2. Locate internal payment record
  const payment = await PaymentModel.findOne({ razorpayOrderId: cleanOrderId });
  if (!payment) {
    const error = new Error(
      `Payment order not found for order ID: ${cleanOrderId}.`
    );
    error.statusCode = 404;
    throw error;
  }

  // 3. User Ownership & Consistency Validation
  if (payment.userId !== String(userId)) {
    const error = new Error(
      "Access denied. You cannot verify a payment belonging to another user."
    );
    error.statusCode = 403;
    throw error;
  }

  if (payment.currency !== "INR") {
    const error = new Error(
      "Currency mismatch. Only INR transactions are supported."
    );
    error.statusCode = 400;
    throw error;
  }

  // 4. Idempotency Check: Already Credited or Already Captured
  if (payment.status === "CREDITED") {
    return {
      isAlreadyVerified: true,
      order: {
        success: true,
        message: "Payment has already been verified and credited.",
        paymentId: payment.internalPaymentId,
        razorpayPaymentId: payment.razorpayPaymentId || cleanPaymentId,
        razorpayOrderId: payment.razorpayOrderId,
        status: "CREDITED",
      },
    };
  }

  if (
    payment.status === "CAPTURED" &&
    payment.razorpayPaymentId === cleanPaymentId
  ) {
    let creditResult = null;
    try {
      creditResult = await processCapturedPayment({
        internalPaymentId: payment.internalPaymentId,
        razorpayPaymentId: cleanPaymentId,
      });
    } catch (e) {
      console.warn("[verifyPayment] Existing captured payment crediting pending:", e.message);
    }

    return {
      isAlreadyVerified: true,
      order: {
        success: true,
        message: creditResult
          ? "Payment has already been verified and credited."
          : "Payment has already been verified and captured.",
        paymentId: payment.internalPaymentId,
        razorpayPaymentId: payment.razorpayPaymentId,
        razorpayOrderId: payment.razorpayOrderId,
        status: creditResult ? "CREDITED" : "CAPTURED",
        walletCredited: Boolean(creditResult),
      },
    };
  }

  // 5. Cryptographic Signature Verification
  const isSignatureValid = verifyCheckoutSignature({
    orderId: cleanOrderId,
    paymentId: cleanPaymentId,
    signature: cleanSignature,
  });

  if (!isSignatureValid) {
    const error = new Error("Invalid payment signature.");
    error.statusCode = 400;
    throw error;
  }

  // 6. Concurrency lock to serialize state transition
  await acquireUserLock(String(userId));

  try {
    // Re-check payment status under lock
    const lockedPayment = await PaymentModel.findOne({
      razorpayOrderId: cleanOrderId,
    });
    if (!lockedPayment) {
      const error = new Error(
        `Payment order not found for order ID: ${cleanOrderId}.`
      );
      error.statusCode = 404;
      throw error;
    }

    if (lockedPayment.status === "CREDITED") {
      return {
        isAlreadyVerified: true,
        order: {
          success: true,
          message: "Payment has already been verified and credited.",
          paymentId: lockedPayment.internalPaymentId,
          razorpayPaymentId: lockedPayment.razorpayPaymentId || cleanPaymentId,
          razorpayOrderId: lockedPayment.razorpayOrderId,
          status: "CREDITED",
        },
      };
    }

    if (
      lockedPayment.status === "CAPTURED" &&
      lockedPayment.razorpayPaymentId === cleanPaymentId
    ) {
      return {
        isAlreadyVerified: true,
        order: {
          success: true,
          message: "Payment has already been verified and captured.",
          paymentId: lockedPayment.internalPaymentId,
          razorpayPaymentId: lockedPayment.razorpayPaymentId,
          razorpayOrderId: lockedPayment.razorpayOrderId,
          status: "CAPTURED",
        },
      };
    }

    // 7. Verify gateway readiness
    if (!razorpayClient) {
      const error = new Error(
        "Payment gateway is currently unavailable. Razorpay configuration is incomplete or inactive."
      );
      error.statusCode = 503;
      throw error;
    }

    // 8. Fetch actual live payment details from Razorpay SDK
    let rzpPayment;
    try {
      rzpPayment = await razorpayClient.payments.fetch(cleanPaymentId);
    } catch (fetchErr) {
      console.error("[Razorpay Payment Fetch Error]:", {
        message: fetchErr.message,
        statusCode: fetchErr.statusCode,
      });

      const error = new Error(
        fetchErr.error?.description ||
          fetchErr.message ||
          "Failed to retrieve payment details from payment gateway."
      );
      error.statusCode =
        fetchErr.statusCode || (fetchErr.code === "ECONNABORTED" ? 504 : 502);
      throw error;
    }

    if (!rzpPayment || !rzpPayment.id) {
      const error = new Error(
        "Payment gateway returned an invalid payment record."
      );
      error.statusCode = 502;
      throw error;
    }

    // 9. Cross-verify fetched payment with internal order
    if (rzpPayment.id !== cleanPaymentId) {
      const error = new Error("Payment ID mismatch.");
      error.statusCode = 400;
      throw error;
    }

    if (rzpPayment.order_id !== cleanOrderId) {
      const error = new Error("Payment does not belong to the specified order.");
      error.statusCode = 400;
      throw error;
    }

    if (Number(rzpPayment.amount) !== Number(lockedPayment.amount)) {
      const error = new Error("Payment amount mismatch.");
      error.statusCode = 400;
      throw error;
    }

    if (
      !rzpPayment.currency ||
      rzpPayment.currency.toUpperCase() !== lockedPayment.currency.toUpperCase()
    ) {
      const error = new Error("Currency mismatch.");
      error.statusCode = 400;
      throw error;
    }

    // Check if this payment ID was already used on another internal payment
    const existingWithPaymentId = await PaymentModel.findOne({
      razorpayPaymentId: cleanPaymentId,
      internalPaymentId: { $ne: lockedPayment.internalPaymentId },
    });
    if (existingWithPaymentId) {
      const error = new Error(
        "This payment ID has already been utilized for another transaction."
      );
      error.statusCode = 400;
      throw error;
    }

    // 10. State transitions
    const rzpStatus = String(rzpPayment.status).toLowerCase();
    const isCaptured = rzpStatus === "captured" || Boolean(rzpPayment.captured);

    if (isCaptured) {
      lockedPayment.status = "CAPTURED";
      lockedPayment.razorpayPaymentId = cleanPaymentId;
      lockedPayment.razorpaySignature = cleanSignature;
      lockedPayment.method = rzpPayment.method || lockedPayment.method;
      lockedPayment.capturedAt = new Date();
      lockedPayment.updatedAt = new Date();
      await lockedPayment.save();

      // Release user lock before processCapturedPayment to avoid spinlock deadlock
      releaseUserLock(String(userId));

      let creditResult = null;
      try {
        creditResult = await processCapturedPayment({
          internalPaymentId: lockedPayment.internalPaymentId,
          razorpayPaymentId: cleanPaymentId,
        });
      } catch (creditErr) {
        console.warn("[verifyPayment] Immediate wallet crediting deferred:", creditErr.message);
      }

      return {
        isAlreadyVerified: false,
        order: {
          success: true,
          message: creditResult
            ? "Payment successfully verified and credited to wallet."
            : "Payment successfully verified. Wallet crediting is being processed.",
          paymentId: lockedPayment.internalPaymentId,
          razorpayPaymentId: cleanPaymentId,
          razorpayOrderId: cleanOrderId,
          status: creditResult ? "CREDITED" : "CAPTURED",
          walletCredited: Boolean(creditResult),
          amountRupees: creditResult ? creditResult.amountRupees : Math.floor(lockedPayment.amount / 100),
          balanceAfter: creditResult ? creditResult.balanceAfter : undefined,
        },
      };
    }

    if (rzpStatus === "authorized") {
      if (lockedPayment.status === "CREATED") {
        lockedPayment.status = "PENDING";
        lockedPayment.razorpayPaymentId = cleanPaymentId;
        lockedPayment.razorpaySignature = cleanSignature;
        lockedPayment.method = rzpPayment.method || lockedPayment.method;
        lockedPayment.updatedAt = new Date();
        await lockedPayment.save();
      }

      return {
        isAlreadyVerified: false,
        order: {
          success: true,
          message: "Payment is awaiting capture confirmation.",
          paymentId: lockedPayment.internalPaymentId,
          razorpayPaymentId: cleanPaymentId,
          razorpayOrderId: cleanOrderId,
          status: "PENDING",
        },
      };
    }

    if (rzpStatus === "failed") {
      if (
        lockedPayment.status !== "CAPTURED" &&
        lockedPayment.status !== "CREDITED"
      ) {
        lockedPayment.status = "FAILED";
        lockedPayment.razorpayPaymentId = cleanPaymentId;
        lockedPayment.failureReason =
          rzpPayment.error_description || "Payment failed at payment gateway.";
        lockedPayment.updatedAt = new Date();
        await lockedPayment.save();
      }

      const error = new Error(
        rzpPayment.error_description || "Payment has failed at payment gateway."
      );
      error.statusCode = 400;
      error.paymentDetails = {
        success: false,
        message: rzpPayment.error_description || "Payment has failed.",
        paymentId: lockedPayment.internalPaymentId,
        razorpayPaymentId: cleanPaymentId,
        razorpayOrderId: cleanOrderId,
        status: "FAILED",
      };
      throw error;
    }

    // Default / Pending / Unknown state
    return {
      isAlreadyVerified: false,
      order: {
        success: true,
        message: "Payment is awaiting capture confirmation.",
        paymentId: lockedPayment.internalPaymentId,
        razorpayPaymentId: cleanPaymentId,
        razorpayOrderId: cleanOrderId,
        status: "PENDING",
      },
    };
  } finally {
    releaseUserLock(String(userId));
  }
};

/**
 * Retrieves the paginated wallet transaction history for an authenticated user.
 *
 * Requirements:
 * 1. Strictly scopes query to req.userId.
 * 2. Sorts newest first by createdAt / timestamp.
 * 3. Supports limit & page pagination with safe bounding.
 * 4. Read-only ledger view.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.type]
 * @returns {Promise<Object>} Paginated transaction ledger
 */
const getUserTransactionHistory = async ({
  userId,
  page = 1,
  limit = 10,
  type = null,
}) => {
  if (!userId) {
    const error = new Error("User ID is required to fetch transaction history.");
    error.statusCode = 401;
    throw error;
  }

  // Sanitize page and limit
  let parsedPage = parseInt(page, 10);
  if (isNaN(parsedPage) || parsedPage < 1) {
    parsedPage = 1;
  }

  let parsedLimit = parseInt(limit, 10);
  if (isNaN(parsedLimit) || parsedLimit < 1) {
    parsedLimit = 10;
  } else if (parsedLimit > 50) {
    parsedLimit = 50; // Bound maximum batch to 50
  }

  const query = { userId: String(userId) };
  if (type && typeof type === "string") {
    const upperType = type.trim().toUpperCase();
    if (["DEPOSIT", "WITHDRAWAL", "REFUND", "ADJUSTMENT"].includes(upperType)) {
      query.type = upperType;
    }
  }

  const skip = (parsedPage - 1) * parsedLimit;

  const [totalRecords, transactions] = await Promise.all([
    WalletTransactionModel.countDocuments(query),
    WalletTransactionModel.find(query)
      .sort({ createdAt: -1, timestamp: -1, _id: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
  ]);

  const totalPages = Math.ceil(totalRecords / parsedLimit) || 1;

  const formattedTransactions = transactions.map((tx) => ({
    _id: tx._id,
    id: tx._id,
    transactionId: tx.paymentId,
    paymentId: tx.paymentId,
    razorpayPaymentId: tx.razorpayPaymentId || null,
    razorpayOrderId: tx.razorpayOrderId || null,
    type: tx.type || tx.transactionType || "DEPOSIT",
    amount: tx.amountPaise ? tx.amountPaise : Math.round((tx.amount || 0) * 100),
    amountPaise: tx.amountPaise ? tx.amountPaise : Math.round((tx.amount || 0) * 100),
    amountRupees: tx.amountRupees || (tx.amountPaise ? tx.amountPaise / 100 : tx.amount),
    currency: tx.currency || "INR",
    balanceBefore: tx.balanceBeforeRupees !== undefined ? tx.balanceBeforeRupees : tx.balanceBefore || 0,
    balanceAfter: tx.balanceAfterRupees !== undefined ? tx.balanceAfterRupees : tx.balanceAfter || 0,
    status: tx.status || "COMPLETED",
    description: tx.description || `${tx.type || "Transaction"} of ₹${tx.amountRupees || tx.amount}`,
    createdAt: tx.createdAt || tx.timestamp || new Date(),
    timestamp: tx.timestamp || tx.createdAt || new Date(),
  }));

  return {
    success: true,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalRecords,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPrevPage: parsedPage > 1,
    },
    data: formattedTransactions,
  };
};

/**
 * Checks the authoritative status of a payment order for an authenticated user.
 *
 * Requirements:
 * 1. Enforces strict ownership check (payment.userId === userId).
 * 2. Checks DB state; if CREDITED or FAILED, returns immediately.
 * 3. For pending/uncertain states, queries Razorpay orders.fetchPayments() authoritatively.
 * 4. If Razorpay reports captured, triggers processCapturedPayment to reconcile and credit wallet.
 * 5. If Razorpay reports failed, updates DB status to FAILED.
 * 6. Never downgrades CREDITED to FAILED or PENDING.
 * 7. Completely idempotent.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.orderId - razorpayOrderId, internalPaymentId, or razorpayPaymentId
 * @returns {Promise<Object>} Status response
 */
const getPaymentStatus = async ({ userId, orderId }) => {
  if (!userId) {
    const error = new Error("User ID is required to fetch payment status.");
    error.statusCode = 401;
    throw error;
  }

  if (!orderId || typeof orderId !== "string") {
    const error = new Error("Payment or Order ID is required.");
    error.statusCode = 400;
    throw error;
  }

  const cleanId = orderId.trim();

  // Find by razorpayOrderId, internalPaymentId, or razorpayPaymentId
  const payment = await PaymentModel.findOne({
    $or: [
      { razorpayOrderId: cleanId },
      { internalPaymentId: cleanId },
      { razorpayPaymentId: cleanId },
    ],
  });

  if (!payment) {
    const error = new Error(`Payment order not found for ID '${cleanId}'.`);
    error.statusCode = 404;
    throw error;
  }

  // Strict ownership check
  if (payment.userId !== String(userId)) {
    const error = new Error("Access denied. You cannot check status of a payment belonging to another user.");
    error.statusCode = 403;
    throw error;
  }

  // If already CREDITED or FAILED (terminal states), return immediately
  if (payment.status === "CREDITED") {
    return {
      success: true,
      status: "CREDITED",
      walletCredited: true,
      message: "Payment verified and credited to wallet.",
      payment: {
        internalPaymentId: payment.internalPaymentId,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        amount: payment.amount,
        amountRupees: Math.floor(payment.amount / 100),
        currency: payment.currency,
        status: "CREDITED",
        capturedAt: payment.capturedAt,
        creditedAt: payment.creditedAt,
      },
    };
  }

  if (payment.status === "FAILED") {
    return {
      success: true,
      status: "FAILED",
      walletCredited: false,
      message: payment.failureReason || "Payment failed at payment gateway.",
      payment: {
        internalPaymentId: payment.internalPaymentId,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        amount: payment.amount,
        amountRupees: Math.floor(payment.amount / 100),
        currency: payment.currency,
        status: "FAILED",
        failureReason: payment.failureReason,
      },
    };
  }

  // Non-terminal states: CREATED, PENDING, or CAPTURED (pending crediting)
  // Query Razorpay API authoritatively if client is available
  if (razorpayClient && payment.razorpayOrderId) {
    try {
      const orderPayments = await razorpayClient.orders.fetchPayments(payment.razorpayOrderId);
      if (orderPayments && orderPayments.items && orderPayments.items.length > 0) {
        const capturedItem = orderPayments.items.find((p) => p.status === "captured");
        const authorizedItem = orderPayments.items.find((p) => p.status === "authorized");
        const failedItem = orderPayments.items.find((p) => p.status === "failed");

        if (capturedItem) {
          // Authoritative capture confirmed by gateway!
          payment.status = "CAPTURED";
          payment.razorpayPaymentId = capturedItem.id;
          payment.capturedAt = new Date(capturedItem.created_at * 1000 || Date.now());
          payment.paymentMethod = capturedItem.method || payment.paymentMethod;
          await payment.save();

          // Trigger central wallet crediting
          await processCapturedPayment({
            internalPaymentId: payment.internalPaymentId,
            razorpayPaymentId: capturedItem.id,
          });

          // Reload updated payment
          const updated = await PaymentModel.findById(payment._id);

          return {
            success: true,
            status: "CREDITED",
            walletCredited: true,
            reconciled: true,
            message: "Payment confirmed with gateway and funds credited to wallet.",
            payment: {
              internalPaymentId: updated.internalPaymentId,
              razorpayOrderId: updated.razorpayOrderId,
              razorpayPaymentId: updated.razorpayPaymentId,
              amount: updated.amount,
              amountRupees: Math.floor(updated.amount / 100),
              currency: updated.currency,
              status: "CREDITED",
              capturedAt: updated.capturedAt,
              creditedAt: updated.creditedAt,
            },
          };
        } else if (authorizedItem) {
          payment.status = "PENDING";
          payment.razorpayPaymentId = authorizedItem.id;
          await payment.save();

          return {
            success: true,
            status: "PENDING",
            walletCredited: false,
            message: "Payment is authorized and awaiting capture confirmation.",
            payment: {
              internalPaymentId: payment.internalPaymentId,
              razorpayOrderId: payment.razorpayOrderId,
              razorpayPaymentId: authorizedItem.id,
              amount: payment.amount,
              amountRupees: Math.floor(payment.amount / 100),
              currency: payment.currency,
              status: "PENDING",
            },
          };
        } else if (failedItem && orderPayments.items.length === 1) {
          payment.status = "FAILED";
          payment.failureReason = failedItem.error_description || "Payment declined by bank issuer.";
          await payment.save();

          return {
            success: true,
            status: "FAILED",
            walletCredited: false,
            message: payment.failureReason,
            payment: {
              internalPaymentId: payment.internalPaymentId,
              razorpayOrderId: payment.razorpayOrderId,
              status: "FAILED",
              failureReason: payment.failureReason,
            },
          };
        }
      }
    } catch (rzpErr) {
      console.warn("[getPaymentStatus] Authoritative Razorpay fetch error:", rzpErr.message);
    }
  }

  // If currently CAPTURED but not CREDITED (e.g. earlier transient db write conflict)
  if (payment.status === "CAPTURED") {
    try {
      await processCapturedPayment({
        internalPaymentId: payment.internalPaymentId,
        razorpayPaymentId: payment.razorpayPaymentId,
      });
      const reloaded = await PaymentModel.findById(payment._id);
      if (reloaded.status === "CREDITED") {
        return {
          success: true,
          status: "CREDITED",
          walletCredited: true,
          reconciled: true,
          message: "Payment verified and funds credited to wallet.",
          payment: {
            internalPaymentId: reloaded.internalPaymentId,
            razorpayOrderId: reloaded.razorpayOrderId,
            razorpayPaymentId: reloaded.razorpayPaymentId,
            amount: reloaded.amount,
            amountRupees: Math.floor(reloaded.amount / 100),
            currency: reloaded.currency,
            status: "CREDITED",
          },
        };
      }
    } catch (err) {
      console.warn("[getPaymentStatus] Captured retry crediting:", err.message);
    }
  }

  // Default return for CREATED / PENDING where gateway hasn't captured anything yet
  return {
    success: true,
    status: payment.status,
    walletCredited: false,
    message:
      payment.status === "CREATED"
        ? "Payment checkout order is active. Awaiting payment completion."
        : "Payment is pending gateway confirmation.",
    payment: {
      internalPaymentId: payment.internalPaymentId,
      razorpayOrderId: payment.razorpayOrderId,
      amount: payment.amount,
      amountRupees: Math.floor(payment.amount / 100),
      currency: payment.currency,
      status: payment.status,
    },
  };
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  getPaymentStatus,
  getUserTransactionHistory,
  validateDepositAmount,
  MIN_DEPOSIT_RUPEES,
  MAX_DEPOSIT_RUPEES,
};
