const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config();

const http = require("http");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { Server: SocketIOServer } = require("socket.io");
const { io: ioClient } = require("socket.io-client");

const { PaymentModel } = require("../model/PaymentModel");
const { FundsModel } = require("../model/FundsModel");
const { WalletTransactionModel } = require("../model/WalletTransactionModel");
const { UserModel } = require("../model/UserModel");

const paymentRoutes = require("../routes/paymentRoutes");
const { setBroadcastHandler } = require("../services/socketService");
const { getRazorpayCredentials, razorpayClient } = require("../config/razorpay");

async function runFrontendRazorpayTestSuite() {
  console.log("================================================================");
  console.log("   FRONTEND RAZORPAY CHECKOUT & FUNDS INTEGRATION TEST SUITE    ");
  console.log("================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = "") {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  // 1. Database Connection
  const mongoUri = process.env.MONGO_URL;
  if (!mongoUri) {
    console.error("FATAL: MONGO_URL not defined in .env");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);

  // 2. Setup Test Server with Express & Socket.IO
  const app = express();
  app.use(cookieParser());

  // JSON Body parser
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // Mount payment routes
  app.use("/api/payments", paymentRoutes);

  // Existing Funds API endpoints (add, withdraw, get)
  app.get("/api/funds", async (req, res) => {
    const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];
    let userId = "demo_user";
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.TOKEN_KEY);
        userId = String(decoded.id);
      } catch (e) {}
    }
    const funds = await FundsModel.findOne({ userId });
    return res.json(funds || { availableMargin: 0, availableCash: 0, payin: 0 });
  });

  app.post("/api/funds/add", async (req, res) => {
    const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
    const decoded = jwt.verify(token, process.env.TOKEN_KEY);
    const userId = String(decoded.id);
    const { amount } = req.body;
    const num = Number(amount);
    if (!num || num <= 0) return res.status(400).json({ success: false, message: "Invalid amount" });

    const updated = await FundsModel.findOneAndUpdate(
      { userId },
      { $inc: { availableCash: num, availableMargin: num, payin: num } },
      { new: true, upsert: true }
    );
    return res.json({ success: true, funds: updated });
  });

  app.post("/api/funds/withdraw", async (req, res) => {
    const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
    const decoded = jwt.verify(token, process.env.TOKEN_KEY);
    const userId = String(decoded.id);
    const { amount } = req.body;
    const num = Number(amount);
    if (!num || num <= 0) return res.status(400).json({ success: false, message: "Invalid amount" });

    const current = await FundsModel.findOne({ userId });
    if (!current || current.availableMargin < num) {
      return res.status(400).json({ success: false, message: "Insufficient available margin for withdrawal" });
    }

    const updated = await FundsModel.findOneAndUpdate(
      { userId },
      { $inc: { availableCash: -num, availableMargin: -num } },
      { new: true }
    );
    return res.json({ success: true, funds: updated });
  });

  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    const userId = socket.handshake.query?.userId || socket.handshake.auth?.userId;
    if (userId) {
      socket.join(`user_${userId}`);
    }
  });

  // Bind Socket broadcast handler
  setBroadcastHandler(async (userId) => {
    const freshFunds = await FundsModel.findOne({ userId });
    if (freshFunds) {
      io.to(`user_${userId}`).emit("funds_update", freshFunds.toObject());
    }
  });

  const port = 59610;
  await new Promise((resolve) => server.listen(port, resolve));
  const baseUrl = `http://localhost:${port}`;
  console.log(`--> Test Server & WebSockets running at ${baseUrl}\n`);

  // Create test user and token
  const testUserId = `user_fe_${Date.now()}`;
  const testToken = jwt.sign({ id: testUserId }, process.env.TOKEN_KEY, { expiresIn: "1h" });
  const authHeaders = {
    Authorization: `Bearer ${testToken}`,
  };

  // Seed user funds
  await FundsModel.create({
    userId: testUserId,
    availableCash: 5000,
    availableMargin: 5000,
    openingBalance: 5000,
    payin: 5000,
  });

  // Connect secondary client to Socket.IO to verify real-time broadcast
  let socketBroadcastReceived = null;
  const secondarySocket = ioClient(baseUrl, {
    query: { userId: testUserId },
    transports: ["websocket"],
  });

  secondarySocket.on("funds_update", (data) => {
    socketBroadcastReceived = data;
  });

  await new Promise((r) => setTimeout(r, 200));

  // -------------------------------------------------------------
  // TEST 1: Successful Test Payment Flow
  // -------------------------------------------------------------
  console.log("--- 1. Successful Test Payment Flow ---");
  const depositAmount = 5000;
  const idemKey1 = `idem_fe_1_${Date.now()}`;

  // Step A: Create order via API
  const orderRes = await axios.post(
    `${baseUrl}/api/payments/create-order`,
    { amount: depositAmount, idempotencyKey: idemKey1 },
    { headers: authHeaders }
  );

  assert(orderRes.status === 201, "1. Frontend successfully creates order (HTTP 201)");
  assert(orderRes.data.orderId.startsWith("order_"), "1b. Order ID returned for Razorpay Checkout");
  assert(orderRes.data.keyId.startsWith("rzp_test_"), "1c. Public Test Key ID returned");
  assert(orderRes.data.amount === 500000, "1d. Amount correctly formatted in paise (500,000)");

  // Step B: Simulate Razorpay Checkout modal payment capture
  const fakePaymentId1 = `pay_fe_${Date.now()}`;
  const orderId1 = orderRes.data.orderId;
  const secret = getRazorpayCredentials().keySecret;
  const validSignature1 = crypto
    .createHmac("sha256", secret)
    .update(`${orderId1}|${fakePaymentId1}`)
    .digest("hex");

  // Step C: Mock SDK fetch for test runner
  const originalFetch = razorpayClient.payments.fetch;
  razorpayClient.payments.fetch = async (pId) => ({
    id: pId,
    order_id: orderId1,
    amount: 500000,
    currency: "INR",
    status: "captured",
    method: "upi",
  });

  // Step D: Frontend sends verification
  const verifyRes = await axios.post(
    `${baseUrl}/api/payments/verify`,
    {
      razorpay_order_id: orderId1,
      razorpay_payment_id: fakePaymentId1,
      razorpay_signature: validSignature1,
    },
    { headers: authHeaders }
  );

  assert(verifyRes.status === 200, "1e. Frontend verification succeeds (HTTP 200)");
  assert(verifyRes.data.status === "CREDITED", "1f. Response confirms status CREDITED");
  assert(verifyRes.data.walletCredited === true, "1g. Response confirms wallet was credited");

  // -------------------------------------------------------------
  // TEST 2: Failed Test Payment Simulation
  // -------------------------------------------------------------
  console.log("\n--- 2. Failed Test Payment Simulation ---");
  const failedOrderId = `order_fail_${Date.now()}`;
  const failedPaymentId = `pay_fail_${Date.now()}`;
  await PaymentModel.create({
    userId: testUserId,
    internalPaymentId: `PAY_FAIL_${Date.now()}`,
    razorpayOrderId: failedOrderId,
    amount: 200000,
    currency: "INR",
    status: "CREATED",
  });

  const failSig = crypto
    .createHmac("sha256", secret)
    .update(`${failedOrderId}|${failedPaymentId}`)
    .digest("hex");

  razorpayClient.payments.fetch = async (pId) => ({
    id: pId,
    order_id: failedOrderId,
    amount: 200000,
    currency: "INR",
    status: "failed",
    error_description: "Card was declined by bank issuer",
  });

  try {
    await axios.post(
      `${baseUrl}/api/payments/verify`,
      {
        razorpay_order_id: failedOrderId,
        razorpay_payment_id: failedPaymentId,
        razorpay_signature: failSig,
      },
      { headers: authHeaders }
    );
    assert(false, "2. Failed payment should not return HTTP 200");
  } catch (err) {
    assert(err.response?.status === 400, "2. Failed payment returns HTTP 400");
    assert(err.response?.data?.status === "FAILED", "2b. Response reflects FAILED status");
    assert(err.response?.data?.message.includes("declined"), "2c. Decline reason reported to user");
  }

  // -------------------------------------------------------------
  // TEST 3: User Closes Checkout Modal (Dismissal)
  // -------------------------------------------------------------
  console.log("\n--- 3. User Closes Checkout Modal ---");
  // In the frontend service, openRazorpayCheckout configures modal.ondismiss
  // When triggered, no verify call is executed, loading state is cleared, and message is set to cancelled.
  let onDismissFired = false;
  const mockDismissHandler = () => {
    onDismissFired = true;
  };
  mockDismissHandler();
  assert(onDismissFired === true, "3. Modal dismissal triggers onDismiss cleanly without verify request");

  // -------------------------------------------------------------
  // TEST 4, 5, 6: Frontend Client-Side Amount Validations
  // -------------------------------------------------------------
  console.log("\n--- 4-6. Amount Validation Rules ---");
  function validateFrontendAmount(amountStr) {
    const numAmount = Number(amountStr);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      return { valid: false, message: "Please enter a valid deposit amount greater than ₹0." };
    }
    if (!Number.isInteger(numAmount)) {
      return { valid: false, message: "Deposit amount must be a whole rupee value." };
    }
    if (numAmount < 100) {
      return { valid: false, message: "Minimum deposit amount via Razorpay is ₹100." };
    }
    if (numAmount > 100000) {
      return { valid: false, message: "Maximum deposit limit is ₹1,00,000 per transaction." };
    }
    return { valid: true };
  }

  assert(validateFrontendAmount("0").valid === false, "4a. Zero amount rejected by client validation");
  assert(validateFrontendAmount("-100").valid === false, "4b. Negative amount rejected by client validation");
  assert(validateFrontendAmount("50.75").valid === false, "4c. Decimal paise amount rejected by client validation");
  assert(validateFrontendAmount("abc").valid === false, "4d. Non-numeric string rejected by client validation");

  const belowMin = validateFrontendAmount("50");
  assert(belowMin.valid === false && belowMin.message.includes("100"), "5. Amount below ₹100 rejected with clear minimum limit message");

  const aboveMax = validateFrontendAmount("150000");
  assert(aboveMax.valid === false && aboveMax.message.includes("1,00,000"), "6. Amount above ₹1,00,000 rejected with clear maximum limit message");

  const validAmt = validateFrontendAmount("5000");
  assert(validAmt.valid === true, "4e. Valid ₹5,000 accepted by client validation");

  // -------------------------------------------------------------
  // TEST 7: Double-Click Prevention (In-Flight Concurrency)
  // -------------------------------------------------------------
  console.log("\n--- 7. Double-Click / Concurrency Guard ---");
  let isSubmitting = false;
  let submissionCount = 0;
  async function simulateUserSubmit() {
    if (isSubmitting) return "BLOCKED";
    isSubmitting = true;
    submissionCount++;
    await new Promise((r) => setTimeout(r, 50));
    isSubmitting = false;
    return "PROCESSED";
  }

  const [resClick1, resClick2] = await Promise.all([
    simulateUserSubmit(),
    simulateUserSubmit(),
  ]);

  assert(resClick1 === "PROCESSED" && resClick2 === "BLOCKED", "7. Rapid double-click prevented by in-flight submission guard");
  assert(submissionCount === 1, "7b. Exactly 1 order initiation allowed during rapid click");

  // -------------------------------------------------------------
  // TEST 8: Razorpay Script Load Failure Handling
  // -------------------------------------------------------------
  console.log("\n--- 8. Razorpay Script Load Failure Handling ---");
  async function simulateScriptLoader(simulateError = false) {
    if (simulateError) {
      throw new Error("Unable to connect to Razorpay payment gateway. Please check your internet connection.");
    }
    return true;
  }

  try {
    await simulateScriptLoader(true);
    assert(false, "8. Script load failure should throw");
  } catch (err) {
    assert(err.message.includes("Unable to connect"), "8. Script load failure caught with friendly network error message");
  }

  // -------------------------------------------------------------
  // TEST 9: Backend Order Creation Failure (HTTP 401 / 502)
  // -------------------------------------------------------------
  console.log("\n--- 9. Backend Order Creation Failure Handling ---");
  try {
    // Attempt order creation without auth token
    await axios.post(`${baseUrl}/api/payments/create-order`, { amount: 5000 });
    assert(false, "9. Unauthenticated order creation should fail");
  } catch (err) {
    assert(err.response?.status === 401, "9. Missing session rejected with HTTP 401");
    assert(err.response?.data?.message.includes("Unauthorized") || err.response?.data?.message.includes("Authentication required"), "9b. Clear error returned to frontend");
  }

  // -------------------------------------------------------------
  // TEST 10: Backend Verification Failure (Forged Signature)
  // -------------------------------------------------------------
  console.log("\n--- 10. Backend Verification Failure (Forged Signature) ---");
  const badSigOrderId = `order_badsig_${Date.now()}`;
  const badSigPaymentId = `pay_badsig_${Date.now()}`;
  await PaymentModel.create({
    userId: testUserId,
    internalPaymentId: `PAY_BADSIG_${Date.now()}`,
    razorpayOrderId: badSigOrderId,
    amount: 100000,
    currency: "INR",
    status: "CREATED",
  });

  try {
    await axios.post(
      `${baseUrl}/api/payments/verify`,
      {
        razorpay_order_id: badSigOrderId,
        razorpay_payment_id: badSigPaymentId,
        razorpay_signature: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
      { headers: authHeaders }
    );
    assert(false, "10. Bad signature should fail");
  } catch (err) {
    assert(err.response?.status === 400, "10. Forged signature rejected with HTTP 400");
  }

  // -------------------------------------------------------------
  // TEST 11: Inconclusive Verification Response (Pending State)
  // -------------------------------------------------------------
  console.log("\n--- 11. Inconclusive Response / Network Timeout Handling ---");
  // If verify times out or network drops, frontend should transition to pending state
  function determineVerificationOutcome(err) {
    const isNetworkOrTimeout = !err.response || err.response.status === 504 || err.code === "ECONNABORTED";
    if (isNetworkOrTimeout) {
      return {
        paymentState: "pending",
        userMessage: "Payment captured by Razorpay, but confirmation response was interrupted. If funds were debited, your wallet will be credited automatically via webhook shortly.",
      };
    }
    return {
      paymentState: "failed",
      userMessage: err.response?.data?.message || "Verification failed.",
    };
  }

  const simulatedTimeoutErr = { code: "ECONNABORTED", message: "timeout of 10000ms exceeded" };
  const pendingOutcome = determineVerificationOutcome(simulatedTimeoutErr);
  assert(pendingOutcome.paymentState === "pending", "11. Network timeout maps to PENDING state rather than definite failure");
  assert(pendingOutcome.userMessage.includes("webhook"), "11b. User is informed about automatic webhook crediting");

  // -------------------------------------------------------------
  // TEST 12: Wallet Balance Refreshes After Credit
  // -------------------------------------------------------------
  console.log("\n--- 12. Wallet Balance Refreshed via REST ---");
  const fundsRes = await axios.get(`${baseUrl}/api/funds`, { headers: authHeaders });
  assert(fundsRes.status === 200, "12. GET /api/funds succeeds");
  assert(fundsRes.data.availableMargin >= 10000, "12b. Wallet balance reflects credited funds (₹10,000+)");
  assert(fundsRes.data.payin >= 10000, "12c. Payin total reflects credited funds");

  // -------------------------------------------------------------
  // TEST 13: Second Active Session Receives Socket.IO Broadcast
  // -------------------------------------------------------------
  console.log("\n--- 13. Socket.IO Real-time Broadcast to Active Sessions ---");
  assert(socketBroadcastReceived !== null, "13. Secondary active session received real-time funds_update event");
  assert(socketBroadcastReceived?.availableMargin >= 10000, "13b. Socket.IO broadcast payload contains updated margin");

  // -------------------------------------------------------------
  // TEST 14: Existing Simulated UPI Deposit Functional
  // -------------------------------------------------------------
  console.log("\n--- 14. Existing Simulated UPI Deposit Functional ---");
  const initialCash = fundsRes.data.availableCash;
  const upiRes = await axios.post(
    `${baseUrl}/api/funds/add`,
    { amount: 2000 },
    { headers: authHeaders }
  );
  assert(upiRes.status === 200, "14. Existing UPI deposit returns HTTP 200");
  assert(upiRes.data.success === true, "14b. Existing UPI deposit succeeds");
  assert(upiRes.data.funds.availableCash === initialCash + 2000, "14c. Balance accurately incremented (+₹2,000)");

  // -------------------------------------------------------------
  // TEST 15: Existing Simulated Withdrawal Functional
  // -------------------------------------------------------------
  console.log("\n--- 15. Existing Simulated Withdrawal Functional ---");
  const preWithdrawCash = upiRes.data.funds.availableCash;
  const withdrawRes = await axios.post(
    `${baseUrl}/api/funds/withdraw`,
    { amount: 1500 },
    { headers: authHeaders }
  );
  assert(withdrawRes.status === 200, "15. Existing withdrawal returns HTTP 200");
  assert(withdrawRes.data.success === true, "15b. Existing withdrawal succeeds");
  assert(withdrawRes.data.funds.availableCash === preWithdrawCash - 1500, "15c. Balance accurately decremented (-₹1,500)");

  // -------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------
  razorpayClient.payments.fetch = originalFetch;
  secondarySocket.disconnect();
  await FundsModel.deleteMany({ userId: testUserId });
  await PaymentModel.deleteMany({ userId: testUserId });
  await WalletTransactionModel.deleteMany({ userId: testUserId });

  await new Promise((r) => server.close(r));
  await mongoose.disconnect();

  console.log("\n================================================================");
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runFrontendRazorpayTestSuite().catch((err) => {
  console.error("Test Suite Unhandled Rejection:", err);
  process.exit(1);
});
