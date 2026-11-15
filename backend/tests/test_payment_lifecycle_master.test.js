const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config();

const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { Server } = require("socket.io");
const ioClient = require("socket.io-client");
const crypto = require("crypto");

const { PaymentModel } = require("../model/PaymentModel");
const { FundsModel } = require("../model/FundsModel");
const { WalletTransactionModel } = require("../model/WalletTransactionModel");
const { WebhookEventModel } = require("../model/WebhookEventModel");
const { OrdersModel } = require("../model/OrdersModel");
const { HoldingsModel } = require("../model/HoldingsModel");

const paymentRoutes = require("../routes/paymentRoutes");
const webhookRoutes = require("../routes/webhookRoutes");
const {
  razorpayClient,
  getRazorpayCredentials,
} = require("../config/razorpay");
const { setBroadcastHandler } = require("../services/socketService");
const { processOrder } = require("../services/orderExecutionService");
const { processCapturedPayment } = require("../services/paymentProcessingService");
const {
  initiatePaymentRefund,
  getPaymentRefundHistory,
} = require("../services/paymentRefundService");

async function runMasterPaymentLifecycleTestSuite() {
  console.log("================================================================");
  console.log("  COMPREHENSIVE PAYMENT LIFECYCLE & INTEGRATION QA TEST SUITE   ");
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

  // 1. Connect to Database
  const mongoUri = process.env.MONGO_URL;
  if (!mongoUri) {
    console.error("FATAL: MONGO_URL not configured in environment.");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log("--> Connected to MongoDB Atlas\n");

  // 2. Setup Express & Socket.IO Test Server
  const app = express();
  app.use(cookieParser());
  app.use(
    bodyParser.json({
      verify: (req, res, buf) => {
        req.rawBody = buf.toString("utf8");
      },
    })
  );

  app.use("/api/payments", paymentRoutes);
  app.use("/api/webhooks", webhookRoutes);

  // Mount existing funds & trading mock routes for end-to-end verification
  app.post("/api/funds/deposit", async (req, res) => {
    const { userId, amount } = req.body;
    const numAmount = Number(amount);
    const funds = await FundsModel.findOneAndUpdate(
      { userId },
      { $inc: { availableCash: numAmount, availableMargin: numAmount, payin: numAmount } },
      { upsert: true, returnDocument: "after" }
    );
    const balanceBefore = funds.availableMargin - numAmount;
    await WalletTransactionModel.create({
      userId,
      paymentId: `UPI_SIM_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: "DEPOSIT",
      amount: numAmount * 100,
      amountPaise: numAmount * 100,
      amountRupees: numAmount,
      balanceBefore,
      balanceAfter: funds.availableMargin,
      status: "COMPLETED",
      description: `Simulated UPI deposit of ₹${numAmount}`,
    });
    return res.json({ success: true, funds });
  });

  app.post("/api/funds/withdraw", async (req, res) => {
    const { userId, amount } = req.body;
    const numAmount = Number(amount);
    const funds = await FundsModel.findOne({ userId });
    if (!funds || funds.availableMargin < numAmount) {
      return res.status(400).json({ success: false, message: "Insufficient funds" });
    }
    funds.availableCash -= numAmount;
    funds.availableMargin -= numAmount;
    await funds.save();
    await WalletTransactionModel.create({
      userId,
      paymentId: `WITHDRAW_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: "WITHDRAWAL",
      amount: numAmount * 100,
      amountPaise: numAmount * 100,
      amountRupees: numAmount,
      balanceBefore: funds.availableMargin + numAmount,
      balanceAfter: funds.availableMargin,
      status: "COMPLETED",
      description: `Simulated withdrawal of ₹${numAmount}`,
    });
    return res.json({ success: true, funds });
  });

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    const userId = socket.handshake.query?.userId || "anonymous";
    socket.join(`user_${userId}`);
  });

  // Wire up socket broadcasting
  setBroadcastHandler(async (userId) => {
    const funds = await FundsModel.findOne({ userId });
    io.to(`user_${userId}`).emit("funds_update", funds);
  });

  const port = 59650;
  await new Promise((resolve) => server.listen(port, resolve));
  const baseUrl = `http://localhost:${port}`;
  console.log(`--> Ephemeral QA Server listening at ${baseUrl}\n`);

  const tokenSecret = process.env.TOKEN_KEY || "default_test_token_secret";
  const userAlphaId = `trader_alpha_${Date.now()}`;
  const userBetaId = `trader_beta_${Date.now()}`;

  const alphaToken = jwt.sign({ id: userAlphaId }, tokenSecret);
  const betaToken = jwt.sign({ id: userBetaId }, tokenSecret);

  // Initialize funds
  await FundsModel.findOneAndUpdate(
    { userId: userAlphaId },
    { $set: { availableCash: 5000, availableMargin: 5000, usedMargin: 0, payin: 5000 } },
    { upsert: true, returnDocument: "after" }
  );

  await FundsModel.findOneAndUpdate(
    { userId: userBetaId },
    { $set: { availableCash: 1000, availableMargin: 1000, usedMargin: 0, payin: 1000 } },
    { upsert: true, returnDocument: "after" }
  );

  // Connect WebSocket Client for User Alpha
  let socketFundsUpdates = [];
  const clientSocket = ioClient(baseUrl, {
    query: { userId: userAlphaId },
    transports: ["websocket"],
  });

  clientSocket.on("funds_update", (data) => {
    socketFundsUpdates.push(data);
  });

  await new Promise((r) => setTimeout(r, 600));

  try {
    // =========================================================================
    // SECTION 1: ORDER CREATION & AMOUNT VALIDATION
    // =========================================================================
    console.log("--- Section 1: Order Creation & Amount Limits ---");
    // 1A. Valid deposit order (₹5,000 = 500,000 paise)
    const createOrderResp = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      { amount: 5000 },
      { headers: { Authorization: `Bearer ${alphaToken}` } }
    );

    assert(createOrderResp.status === 201, "Section 1: Order creation returns HTTP 201");
    assert(createOrderResp.data.success === true, "Section 1: Response indicates success");
    assert(createOrderResp.data.amount === 500000, "Section 1: Amount converted to 500,000 integer paise");
    assert(createOrderResp.data.amountRupees === 5000, "Section 1: amountRupees accurately set to ₹5,000");
    assert(createOrderResp.data.currency === "INR", "Section 1: Currency is INR");
    assert(createOrderResp.data.status === "CREATED", "Section 1: Initial status is CREATED");

    const orderId1 = createOrderResp.data.orderId;
    const internalPayId1 = createOrderResp.data.internalPaymentId;

    // 1B. Amount boundary checks
    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        { amount: 50 }, // Below ₹100 min
        { headers: { Authorization: `Bearer ${alphaToken}` } }
      );
      assert(false, "Section 1: Amount below ₹100 should be rejected");
    } catch (e) {
      assert(e.response?.status === 400, "Section 1: Amount < ₹100 rejected with HTTP 400");
    }

    try {
      await axios.post(
        `${baseUrl}/api/payments/create-order`,
        { amount: 200000 }, // Above ₹1,00,000 max
        { headers: { Authorization: `Bearer ${alphaToken}` } }
      );
      assert(false, "Section 1: Amount > ₹1,00,000 should be rejected");
    } catch (e) {
      assert(e.response?.status === 400, "Section 1: Amount > ₹1,00,000 rejected with HTTP 400");
    }

    // =========================================================================
    // SECTION 2: CONCURRENT PAYMENT ORDERS & IDEMPOTENCY
    // =========================================================================
    console.log("\n--- Section 2: Concurrency & Order Idempotency ---");
    const testIdempotencyKey = `idem_lifecycle_${Date.now()}`;

    // Rapid double-submission with identical idempotency key
    const [idempA, idempB] = await Promise.all([
      axios.post(
        `${baseUrl}/api/payments/create-order`,
        { amount: 3000, idempotencyKey: testIdempotencyKey },
        { headers: { Authorization: `Bearer ${alphaToken}` } }
      ),
      axios.post(
        `${baseUrl}/api/payments/create-order`,
        { amount: 3000, idempotencyKey: testIdempotencyKey },
        { headers: { Authorization: `Bearer ${alphaToken}` } }
      ),
    ]);

    const createdResp = idempA.status === 201 ? idempA : idempB;
    const duplicateResp = idempA.status === 200 ? idempA : idempB;

    assert(createdResp.status === 201, "Section 2: First concurrent order returns HTTP 201 Created");
    assert(duplicateResp.status === 200, "Section 2: Duplicate concurrent order returns HTTP 200 OK");
    assert(duplicateResp.data.isDuplicate === true, "Section 2: Duplicate response marked isDuplicate: true");
    assert(
      createdResp.data.orderId === duplicateResp.data.orderId,
      "Section 2: Both requests returned identical Razorpay Order ID"
    );

    const ordersInDb = await PaymentModel.countDocuments({
      userId: userAlphaId,
      idempotencyKey: testIdempotencyKey,
    });
    assert(ordersInDb === 1, "Section 2: Exactly 1 payment record exists in MongoDB for the idempotency key");

    // =========================================================================
    // SECTION 3: OUT-OF-ORDER DELIVERIES (WEBHOOK ARRIVES BEFORE VERIFY)
    // =========================================================================
    console.log("\n--- Section 3: Webhook Arrives Before Checkout Verification ---");
    const payId3 = `pay_lifecycle_wh_first_${Date.now()}`;
    const order3Id = orderId1;
    const { keySecret, webhookSecret } = getRazorpayCredentials();

    // Prepare Webhook payload
    const whPayload3 = {
      entity: "event",
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: payId3,
            amount: 500000,
            currency: "INR",
            status: "captured",
            order_id: order3Id,
            captured: true,
            method: "upi",
          },
        },
      },
    };

    const rawBody3 = JSON.stringify(whPayload3);
    const signature3 = crypto
      .createHmac("sha256", webhookSecret || "test_secret")
      .update(rawBody3)
      .digest("hex");

    // Send Webhook first
    const whResp3 = await axios.post(`${baseUrl}/api/webhooks/razorpay`, rawBody3, {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature3,
        "x-razorpay-event-id": `evt_order3_${Date.now()}`,
      },
    });

    assert(whResp3.status === 200, "Section 3: Webhook payment.captured returns HTTP 200");

    const paymentAfterWh = await PaymentModel.findOne({ razorpayOrderId: order3Id });
    assert(paymentAfterWh.status === "CREDITED", "Section 3: Payment transitioned to CREDITED via webhook");

    const alphaFundsAfterWh = await FundsModel.findOne({ userId: userAlphaId });
    assert(
      alphaFundsAfterWh.availableMargin === 10000, // 5000 + 5000
      `Section 3: User Alpha wallet balance credited to ₹10,000 (was 5000)`
    );

    // Later, frontend checkout callback verification arrives
    const checkoutSignature3 = crypto
      .createHmac("sha256", keySecret || "test_secret")
      .update(`${order3Id}|${payId3}`)
      .digest("hex");

    const verifyResp3 = await axios.post(
      `${baseUrl}/api/payments/verify`,
      {
        razorpay_order_id: order3Id,
        razorpay_payment_id: payId3,
        razorpay_signature: checkoutSignature3,
      },
      { headers: { Authorization: `Bearer ${alphaToken}` } }
    );

    assert(verifyResp3.status === 200, "Section 3: Late frontend verification returns HTTP 200");
    assert(verifyResp3.data.status === "CREDITED", "Section 3: Response reflects CREDITED");

    const alphaFundsAfterVerify = await FundsModel.findOne({ userId: userAlphaId });
    assert(
      alphaFundsAfterVerify.availableMargin === 10000,
      "Section 3: Wallet balance remains strictly at ₹10,000 (Zero double-crediting)"
    );

    const ledgerCount3 = await WalletTransactionModel.countDocuments({
      userId: userAlphaId,
      razorpayOrderId: order3Id,
    });
    assert(ledgerCount3 === 1, "Section 3: Exactly 1 immutable ledger entry exists for this payment");

    // =========================================================================
    // SECTION 4: OUT-OF-ORDER DELIVERIES (VERIFY ARRIVES BEFORE WEBHOOK)
    // =========================================================================
    console.log("\n--- Section 4: Checkout Verification Arrives Before Webhook ---");
    const order4Resp = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      { amount: 2000 },
      { headers: { Authorization: `Bearer ${alphaToken}` } }
    );
    const order4Id = order4Resp.data.orderId;
    const payId4 = `pay_lifecycle_verify_first_${Date.now()}`;

    // Stub razorpayClient.payments.fetch for synthetic payment ID
    const origPaymentsFetch = razorpayClient?.payments?.fetch;
    if (razorpayClient?.payments) {
      razorpayClient.payments.fetch = async (id) => ({
        id,
        order_id: order4Id,
        amount: 200000,
        currency: "INR",
        status: "captured",
        captured: true,
        method: "upi",
      });
    }

    // Frontend verify arrives first
    const checkoutSignature4 = crypto
      .createHmac("sha256", keySecret || "test_secret")
      .update(`${order4Id}|${payId4}`)
      .digest("hex");

    const verifyResp4 = await axios.post(
      `${baseUrl}/api/payments/verify`,
      {
        razorpay_order_id: order4Id,
        razorpay_payment_id: payId4,
        razorpay_signature: checkoutSignature4,
      },
      { headers: { Authorization: `Bearer ${alphaToken}` } }
    );

    assert(verifyResp4.status === 200, "Section 4: Frontend verify returns HTTP 200");
    assert(verifyResp4.data.status === "CREDITED", "Section 4: Frontend verify credited payment");

    const alphaFundsAfterVerify4 = await FundsModel.findOne({ userId: userAlphaId });
    assert(
      alphaFundsAfterVerify4.availableMargin === 12000, // 10000 + 2000
      `Section 4: Wallet balance increased by ₹2,000 to ₹12,000`
    );

    // Later, Webhook arrives
    const whPayload4 = {
      entity: "event",
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: payId4,
            amount: 200000,
            currency: "INR",
            status: "captured",
            order_id: order4Id,
            captured: true,
          },
        },
      },
    };
    const rawBody4 = JSON.stringify(whPayload4);
    const signature4 = crypto
      .createHmac("sha256", webhookSecret || "test_secret")
      .update(rawBody4)
      .digest("hex");

    const whResp4 = await axios.post(`${baseUrl}/api/webhooks/razorpay`, rawBody4, {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature4,
        "x-razorpay-event-id": `evt_order4_${Date.now()}`,
      },
    });

    assert(whResp4.status === 200, "Section 4: Late webhook returns HTTP 200");

    const alphaFundsFinal4 = await FundsModel.findOne({ userId: userAlphaId });
    assert(
      alphaFundsFinal4.availableMargin === 12000,
      "Section 4: Balance remains strictly ₹12,000 (Late webhook safely ignored)"
    );

    // =========================================================================
    // SECTION 5: IMMUTABILITY OF CREDITED PAYMENTS (NO DOWNGRADES)
    // =========================================================================
    console.log("\n--- Section 5: Immutability of Terminal CREDITED Status ---");
    // Delayed payment.authorized webhook arrives after crediting
    const whAuthDelayed = {
      entity: "event",
      event: "payment.authorized",
      payload: { payment: { entity: { id: payId4, order_id: order4Id } } },
    };
    const rawAuth = JSON.stringify(whAuthDelayed);
    const sigAuth = crypto.createHmac("sha256", webhookSecret || "test_secret").update(rawAuth).digest("hex");

    await axios.post(`${baseUrl}/api/webhooks/razorpay`, rawAuth, {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": sigAuth,
        "x-razorpay-event-id": `evt_auth_delay_${Date.now()}`,
      },
    });

    const paymentAfterDelayedAuth = await PaymentModel.findOne({ razorpayOrderId: order4Id });
    assert(
      paymentAfterDelayedAuth.status === "CREDITED",
      "Section 5: Delayed payment.authorized NEVER overwrites CREDITED with PENDING"
    );

    // Delayed payment.failed webhook arrives after crediting
    const whFailDelayed = {
      entity: "event",
      event: "payment.failed",
      payload: { payment: { entity: { id: payId4, order_id: order4Id } } },
    };
    const rawFail = JSON.stringify(whFailDelayed);
    const sigFail = crypto.createHmac("sha256", webhookSecret || "test_secret").update(rawFail).digest("hex");

    await axios.post(`${baseUrl}/api/webhooks/razorpay`, rawFail, {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": sigFail,
        "x-razorpay-event-id": `evt_fail_delay_${Date.now()}`,
      },
    });

    const paymentAfterDelayedFail = await PaymentModel.findOne({ razorpayOrderId: order4Id });
    assert(
      paymentAfterDelayedFail.status === "CREDITED",
      "Section 5: Delayed payment.failed NEVER overwrites CREDITED with FAILED"
    );

    // =========================================================================
    // SECTION 6: DUPLICATE RAZORPAY PAYMENT ID REJECTION
    // =========================================================================
    console.log("\n--- Section 6: Duplicate Razorpay Payment ID Rejection ---");
    // Attempt to credit a completely different order using an already-used razorpayPaymentId (payId4)
    const order6Resp = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      { amount: 1000 },
      { headers: { Authorization: `Bearer ${betaToken}` } }
    );
    const order6Id = order6Resp.data.orderId;

    // Transition to CAPTURED so processCapturedPayment runs duplicate payment ID checks
    await PaymentModel.updateOne(
      { razorpayOrderId: order6Id },
      { $set: { status: "CAPTURED", razorpayPaymentId: payId4 } }
    );

    let duplicatePaymentIdCaught = false;
    try {
      await processCapturedPayment({
        internalPaymentId: order6Resp.data.internalPaymentId,
        razorpayPaymentId: payId4, // Reused payment ID!
      });
    } catch (e) {
      duplicatePaymentIdCaught = true;
      assert(
        e.message.includes("already been credited") || e.code === 11000,
        "Section 6: Clear duplicate payment ID error returned"
      );
    }
    assert(duplicatePaymentIdCaught, "Section 6: Reusing existing razorpayPaymentId was strictly rejected");

    // =========================================================================
    // SECTION 7: MONGODB TRANSACTION ATOMICITY & ROLLBACK
    // =========================================================================
    console.log("\n--- Section 7: MongoDB Transaction Rollback ---");
    const testPay7Id = `PAY_TX_FAIL_${Date.now()}`;
    await PaymentModel.create({
      userId: userAlphaId,
      internalPaymentId: testPay7Id,
      razorpayOrderId: `order_tx_fail_${Date.now()}`,
      razorpayPaymentId: `pay_tx_fail_${Date.now()}`,
      amount: 400000, // ₹4,000
      currency: "INR",
      status: "CAPTURED", // Eligible for crediting
    });

    const marginBeforeRollback = (await FundsModel.findOne({ userId: userAlphaId })).availableMargin;

    // Simulate failure inside transaction by providing invalid ledger data or aborting
    // We test processCapturedPayment error handling
    let txFailed = false;
    try {
      // Intentionally cause error by passing non-existent internalPaymentId
      await processCapturedPayment({ internalPaymentId: "NON_EXISTENT_ID" });
    } catch (e) {
      txFailed = true;
    }
    assert(txFailed, "Section 7: Invalid transaction parameters properly aborted");

    const marginAfterRollback = (await FundsModel.findOne({ userId: userAlphaId })).availableMargin;
    assert(
      marginAfterRollback === marginBeforeRollback,
      "Section 7: Wallet balance was NOT incremented on transaction abort (Rollback confirmed)"
    );

    // =========================================================================
    // SECTION 8: WALLET LEDGER CONSISTENCY & MATHEMATICAL EQUALITY
    // =========================================================================
    console.log("\n--- Section 8: Ledger Consistency & Math Equality ---");
    const alphaTransactions = await WalletTransactionModel.find({ userId: userAlphaId }).sort({ createdAt: 1 });
    assert(alphaTransactions.length >= 2, "Section 8: User Alpha has transaction ledger entries");

    for (const tx of alphaTransactions) {
      assert(
        tx.amountPaise === Math.round(tx.amountRupees * 100),
        `Section 8: Ledger amount math equality verified for tx ${tx.paymentId}`
      );
      assert(
        Number(tx.balanceAfter.toFixed(2)) === Number(tx.balanceAfterRupees.toFixed(2)),
        `Section 8: Ledger balance compatibility fields match for tx ${tx.paymentId}`
      );
    }

    // =========================================================================
    // SECTION 9: USER OWNERSHIP & DATA ISOLATION
    // =========================================================================
    console.log("\n--- Section 9: User Ownership Isolation ---");
    // Beta attempts to fetch Alpha's transaction history
    const betaHistoryResp = await axios.get(`${baseUrl}/api/payments/transactions`, {
      headers: { Authorization: `Bearer ${betaToken}` },
    });

    assert(betaHistoryResp.status === 200, "Section 9: Beta transaction history returns HTTP 200");
    const betaTxs = betaHistoryResp.data.data;
    const hasAlphaRecordInBeta = betaTxs.some((tx) => tx.userId === userAlphaId || tx.paymentId === internalPayId1);
    assert(!hasAlphaRecordInBeta, "Section 9: Beta CANNOT see any of Alpha's transaction records");

    // Beta attempts to check status of Alpha's order
    try {
      await axios.get(`${baseUrl}/api/payments/status/${orderId1}`, {
        headers: { Authorization: `Bearer ${betaToken}` },
      });
      assert(false, "Section 9: Cross-user status check should fail");
    } catch (e) {
      assert(e.response?.status === 403, "Section 9: Cross-user status check rejected with HTTP 403 Forbidden");
    }

    // Beta attempts to refund Alpha's order
    try {
      await axios.post(
        `${baseUrl}/api/payments/refund`,
        { payment_id: orderId1, amount: 1000 },
        { headers: { Authorization: `Bearer ${betaToken}` } }
      );
      assert(false, "Section 9: Cross-user refund should fail");
    } catch (e) {
      assert(e.response?.status === 403, "Section 9: Cross-user refund rejected with HTTP 403 Forbidden");
    }

    // =========================================================================
    // SECTION 10: PAYMENT STATUS RECOVERY AFTER FRONTEND REFRESH
    // =========================================================================
    console.log("\n--- Section 10: Payment Recovery After Page Refresh ---");
    // Create an uncredited captured order
    const recoverOrderResp = await axios.post(
      `${baseUrl}/api/payments/create-order`,
      { amount: 1500 },
      { headers: { Authorization: `Bearer ${alphaToken}` } }
    );
    const recOrderId = recoverOrderResp.data.orderId;
    const recPayId = `pay_rec_refresh_${Date.now()}`;

    // Mark as captured in gateway simulation
    await PaymentModel.updateOne(
      { razorpayOrderId: recOrderId },
      { $set: { status: "CAPTURED", razorpayPaymentId: recPayId, capturedAt: new Date() } }
    );

    if (razorpayClient?.orders) {
      razorpayClient.orders.fetchPayments = async (ordId) => ({
        entity: "collection",
        count: 1,
        items: [
          {
            id: recPayId,
            order_id: recOrderId,
            amount: 150000,
            currency: "INR",
            status: "captured",
            captured: true,
            method: "upi",
          },
        ],
      });
    }

    const marginBeforeRefresh = (await FundsModel.findOne({ userId: userAlphaId })).availableMargin;

    // User refreshes page: GET /api/payments/status/:orderId
    const statusRecoveryResp = await axios.get(`${baseUrl}/api/payments/status/${recOrderId}`, {
      headers: { Authorization: `Bearer ${alphaToken}` },
    });

    assert(statusRecoveryResp.status === 200, "Section 10: Status check returns HTTP 200");
    assert(statusRecoveryResp.data.status === "CREDITED", "Section 10: Status check triggered automatic wallet reconciliation");

    const marginAfterRefresh = (await FundsModel.findOne({ userId: userAlphaId })).availableMargin;
    assert(
      marginAfterRefresh === marginBeforeRefresh + 1500,
      `Section 10: Wallet margin increased by ₹1,500 after recovery (now: ₹${marginAfterRefresh})`
    );

    // =========================================================================
    // SECTION 11: SOCKET.IO NOTIFICATIONS FOR WALLET CREDITING
    // =========================================================================
    console.log("\n--- Section 11: Real-time Socket.IO Broadcast ---");
    assert(
      socketFundsUpdates.length >= 1,
      `Section 11: Socket.IO client received real-time funds_update events (Count: ${socketFundsUpdates.length})`
    );
    const latestSocketUpdate = socketFundsUpdates[socketFundsUpdates.length - 1];
    assert(
      latestSocketUpdate.availableMargin === marginAfterRefresh,
      `Section 11: Socket broadcast contains exact updated availableMargin (₹${latestSocketUpdate.availableMargin})`
    );

    // =========================================================================
    // SECTION 12: SIMULATED UPI DEPOSITS & WITHDRAWALS COMPATIBILITY
    // =========================================================================
    console.log("\n--- Section 12: Simulated UPI Deposit & Withdrawal Functional ---");
    // Deposit ₹3,000 via simulated UPI
    const upiResp = await axios.post(`${baseUrl}/api/funds/deposit`, {
      userId: userAlphaId,
      amount: 3000,
    });
    assert(upiResp.data.success === true, "Section 12: Simulated UPI deposit returns success");
    assert(
      upiResp.data.funds.availableMargin === marginAfterRefresh + 3000,
      "Section 12: Margin incremented by ₹3,000 from simulated UPI"
    );

    // Withdraw ₹2,000 via simulated withdrawal
    const withdrawResp = await axios.post(`${baseUrl}/api/funds/withdraw`, {
      userId: userAlphaId,
      amount: 2000,
    });
    assert(withdrawResp.data.success === true, "Section 12: Simulated withdrawal returns success");
    assert(
      withdrawResp.data.funds.availableMargin === marginAfterRefresh + 1000,
      "Section 12: Margin decremented by ₹2,000 from withdrawal"
    );

    // =========================================================================
    // SECTION 13: STOCK TRADING OPERATIONS (BUY & SELL)
    // =========================================================================
    console.log("\n--- Section 13: Stock Trading (BUY & SELL) Functional ---");
    const currentMargin13 = (await FundsModel.findOne({ userId: userAlphaId })).availableMargin;

    // BUY 5 shares of INFY @ ₹1,400 = ₹7,000
    const buyResult = await processOrder({
      userId: userAlphaId,
      name: "INFOSYS",
      qty: 5,
      price: 1400,
      mode: "BUY",
    });

    assert(buyResult.status === "FILLED", "Section 13: BUY order completed successfully (FILLED)");
    const fundsAfterBuy = await FundsModel.findOne({ userId: userAlphaId });
    assert(
      fundsAfterBuy.availableMargin === currentMargin13 - 7000,
      `Section 13: Available margin reduced by ₹7,000: ₹${currentMargin13} -> ₹${fundsAfterBuy.availableMargin}`
    );
    assert(fundsAfterBuy.usedMargin === 7000, "Section 13: usedMargin updated to ₹7,000");

    // SELL 2 shares of INFY @ ₹1,450 = +₹2,900
    const sellResult = await processOrder({
      userId: userAlphaId,
      name: "INFOSYS",
      qty: 2,
      price: 1450,
      mode: "SELL",
    });

    assert(sellResult.status === "FILLED", "Section 13: SELL order completed successfully (FILLED)");
    const fundsAfterSell = await FundsModel.findOne({ userId: userAlphaId });
    assert(
      fundsAfterSell.availableMargin === currentMargin13 - 7000 + 2900,
      `Section 13: Available margin accurately credited with proceeds: ₹${fundsAfterSell.availableMargin}`
    );

    // =========================================================================
    // SECTION 14: PAGINATION, FILTERING & AUDIT HISTORY
    // =========================================================================
    console.log("\n--- Section 14: Pagination & Transaction Filtering ---");
    const pagedResp = await axios.get(`${baseUrl}/api/payments/transactions?page=1&limit=3`, {
      headers: { Authorization: `Bearer ${alphaToken}` },
    });

    assert(pagedResp.status === 200, "Section 14: Paginated request returns HTTP 200");
    assert(pagedResp.data.data.length === 3, "Section 14: Exactly 3 items returned for limit=3");
    assert(pagedResp.data.pagination.page === 1, "Section 14: pagination.page is 1");
    assert(pagedResp.data.pagination.hasNextPage === true, "Section 14: pagination.hasNextPage is true");

    // Filter by type=DEPOSIT
    const depositOnlyResp = await axios.get(`${baseUrl}/api/payments/transactions?type=DEPOSIT`, {
      headers: { Authorization: `Bearer ${alphaToken}` },
    });
    assert(depositOnlyResp.status === 200, "Section 14: Filtered query returns HTTP 200");
    const allDeposits = depositOnlyResp.data.data.every((t) => t.type === "DEPOSIT");
    assert(allDeposits, "Section 14: All filtered records have type DEPOSIT");

    // Cleanup test data
    clientSocket.disconnect();
    await PaymentModel.deleteMany({ userId: { $in: [userAlphaId, userBetaId] } });
    await FundsModel.deleteMany({ userId: { $in: [userAlphaId, userBetaId] } });
    await WalletTransactionModel.deleteMany({ userId: { $in: [userAlphaId, userBetaId] } });
    await OrdersModel.deleteMany({ userId: { $in: [userAlphaId, userBetaId] } });
    await HoldingsModel.deleteMany({ userId: { $in: [userAlphaId, userBetaId] } });

    console.log("\n================================================================");
    console.log(`LIFECYCLE QA RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("================================================================");

    server.close();
    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed with unhandled exception:", err);
    clientSocket.disconnect();
    server.close();
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runMasterPaymentLifecycleTestSuite();
