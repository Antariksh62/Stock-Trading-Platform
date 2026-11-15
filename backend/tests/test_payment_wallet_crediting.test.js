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

const { PaymentModel } = require("../model/PaymentModel");
const { FundsModel } = require("../model/FundsModel");
const { WalletTransactionModel } = require("../model/WalletTransactionModel");
const { WebhookEventModel } = require("../model/WebhookEventModel");
const { OrdersModel } = require("../model/OrdersModel");
const { HoldingsModel } = require("../model/HoldingsModel");
const { PositionsModel } = require("../model/PositionsModel");

const paymentRoutes = require("../routes/paymentRoutes");
const webhookRoutes = require("../routes/webhookRoutes");
const { processCapturedPayment } = require("../services/paymentProcessingService");
const { setBroadcastHandler } = require("../services/socketService");
const { processOrder } = require("../services/orderExecutionService");
const { razorpayClient, getRazorpayCredentials } = require("../config/razorpay");

async function runWalletCreditingTestSuite() {
  console.log("================================================================");
  console.log("    RAZORPAY WALLET CREDITING & TRANSACTION TEST SUITE         ");
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

  // 1. Connect to MongoDB Atlas
  const mongoUri = process.env.MONGO_URL;
  if (!mongoUri) {
    console.error("FATAL: MONGO_URL not defined in .env");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  try {
    await WalletTransactionModel.collection.dropIndex("razorpayPaymentId_1").catch(() => {});
    await WalletTransactionModel.syncIndexes();
    await PaymentModel.syncIndexes();
    await FundsModel.syncIndexes();
    await WebhookEventModel.syncIndexes();
  } catch (e) {
    await WalletTransactionModel.init();
    await PaymentModel.init();
    await FundsModel.init();
    await WebhookEventModel.init();
  }
  console.log("--> MongoDB Atlas Connected and collections synchronized.\n");

  // Track real-time broadcast calls
  const socketBroadcasts = [];
  setBroadcastHandler((userId) => {
    socketBroadcasts.push({ userId, timestamp: Date.now() });
  });

  // 2. Set up ephemeral Express test app
  const app = express();
  app.use(cookieParser());

  // Webhook raw-body middleware
  app.use(
    "/api/webhooks",
    express.raw({ type: "*/*" }),
    (req, res, next) => {
      req.rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(req.body || "");
      next();
    },
    webhookRoutes
  );

  // Standard JSON body parser
  app.use(
    bodyParser.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use("/api/payments", paymentRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/payments`;
  const webhookUrl = `http://localhost:${port}/api/webhooks/razorpay`;
  console.log(`--> Ephemeral Test Server running on port ${port}\n`);

  const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_wallet_testing_654321";
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

  const { keySecret } = getRazorpayCredentials();
  const tokenSecret = process.env.TOKEN_KEY || "secret_key";

  const testUser = `user_trader_${Date.now()}`;
  const validToken = jwt.sign({ id: testUser }, tokenSecret, { expiresIn: "1h" });
  const authHeaders = { Authorization: `Bearer ${validToken}` };

  const allResponsePayloads = [];

  // Helper to post webhook
  const sendWebhook = async ({ payload, eventId = `evt_w_${Date.now()}_${Math.random().toString(36).substring(7)}` }) => {
    const rawBody = JSON.stringify(payload);
    const signature = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    try {
      const res = await axios.post(webhookUrl, rawBody, {
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": signature,
          "x-razorpay-event-id": eventId,
        },
      });
      allResponsePayloads.push(res.data);
      return res;
    } catch (e) {
      allResponsePayloads.push(e.response?.data);
      return e.response;
    }
  };

  // Helper to seed payment
  const seedTestPayment = async ({
    orderId,
    internalId = `PAY_WC_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    amount = 500000,
    status = "CAPTURED",
    userId = testUser,
    paymentId = `pay_wc_${Date.now()}_${Math.random().toString(36).substring(7)}`,
  }) => {
    return await PaymentModel.create({
      userId,
      internalPaymentId: internalId,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      amount,
      currency: "INR",
      status,
    });
  };

  try {
    // -------------------------------------------------------------
    // TEST 1, 2, 3, 4: Successful Captured Payment Credits Wallet
    // -------------------------------------------------------------
    console.log("--- 1-4. Successful Captured Payment Credits Wallet ---");
    const initialFunds = await FundsModel.create({
      userId: testUser,
      availableMargin: 10000.0,
      availableCash: 10000.0,
      payin: 10000.0,
    });

    const order1 = `order_wc_1_${Date.now()}`;
    const p1 = await seedTestPayment({
      orderId: order1,
      amount: 500000, // ₹5,000
      status: "CAPTURED",
    });

    const creditRes1 = await processCapturedPayment({
      internalPaymentId: p1.internalPaymentId,
      razorpayPaymentId: p1.razorpayPaymentId,
    });

    assert(creditRes1.success === true, "1. processCapturedPayment returns success: true");
    assert(creditRes1.status === "CREDITED", "4. Payment status updated to CREDITED");

    const updatedFunds1 = await FundsModel.findOne({ userId: testUser });
    assert(
      updatedFunds1.availableMargin === 15000.0 && updatedFunds1.availableCash === 15000.0,
      "2. Wallet balance incremented accurately (+₹5,000 from ₹10,000 to ₹15,000)"
    );
    assert(updatedFunds1.payin === 15000.0, "2b. Cumulative payin incremented to ₹15,000");

    const ledgerEntry1 = await WalletTransactionModel.findOne({ paymentId: p1.internalPaymentId });
    assert(ledgerEntry1 !== null, "3. Wallet ledger entry successfully created");
    assert(ledgerEntry1?.amountRupees === 5000.0, "3b. Ledger records amountRupees: ₹5000");
    assert(ledgerEntry1?.amountPaise === 500000, "3c. Ledger records amountPaise: 500000");
    assert(ledgerEntry1?.balanceBeforeRupees === 10000.0, "3d. Ledger records balanceBefore: ₹10,000");
    assert(ledgerEntry1?.balanceAfterRupees === 15000.0, "3e. Ledger records balanceAfter: ₹15,000");
    assert(ledgerEntry1?.status === "COMPLETED", "3f. Ledger status is COMPLETED");

    // -------------------------------------------------------------
    // TEST 5: Repeated Processing Does NOT Credit Twice
    // -------------------------------------------------------------
    console.log("\n--- 5. Repeated Processing Idempotency ---");
    const repeatRes = await processCapturedPayment({
      internalPaymentId: p1.internalPaymentId,
      razorpayPaymentId: p1.razorpayPaymentId,
    });

    assert(repeatRes.success === true, "Repeated call returns success: true");
    assert(repeatRes.isAlreadyCredited === true, "Repeated call identifies isAlreadyCredited: true");

    const repeatFunds = await FundsModel.findOne({ userId: testUser });
    assert(
      repeatFunds.availableMargin === 15000.0,
      "Wallet balance unchanged after repeated processing (no duplicate credit)"
    );

    const txCount = await WalletTransactionModel.countDocuments({ paymentId: p1.internalPaymentId });
    assert(txCount === 1, "Exactly 1 transaction exists in ledger (no duplicate record)");

    // -------------------------------------------------------------
    // TEST 6: Duplicate Webhook Does NOT Credit Twice
    // -------------------------------------------------------------
    console.log("\n--- 6. Duplicate Webhook Idempotency ---");
    const order6 = `order_wc_6_${Date.now()}`;
    const p6 = await seedTestPayment({ orderId: order6, amount: 200000, status: "CREATED" });

    const whPayload6 = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: p6.razorpayPaymentId,
            order_id: order6,
            amount: 200000, // ₹2,000
            currency: "INR",
            status: "captured",
          },
        },
      },
    };

    // First webhook delivery
    const whRes6a = await sendWebhook({ payload: whPayload6, eventId: `evt_wh_6a_${Date.now()}` });
    assert(whRes6a.status === 200, "First webhook delivery succeeded");

    const fundsAfterWh6a = await FundsModel.findOne({ userId: testUser });
    assert(fundsAfterWh6a.availableMargin === 17000.0, "Wallet credited to ₹17,000 by webhook");

    // Second (duplicate) webhook delivery
    const whRes6b = await sendWebhook({ payload: whPayload6, eventId: `evt_wh_6b_${Date.now()}` });
    assert(whRes6b.status === 200, "Second webhook delivery returns HTTP 200");

    const fundsAfterWh6b = await FundsModel.findOne({ userId: testUser });
    assert(
      fundsAfterWh6b.availableMargin === 17000.0,
      "Wallet balance strictly preserved at ₹17,000 (duplicate webhook ignored)"
    );

    // -------------------------------------------------------------
    // TEST 7: Frontend Verification Does NOT Credit Twice After Webhook
    // -------------------------------------------------------------
    console.log("\n--- 7. Frontend Verification After Webhook ---");
    // Frontend verify endpoint called for order 6 (already captured and credited by webhook)
    const sig6 = crypto
      .createHmac("sha256", keySecret)
      .update(`${order6}|${p6.razorpayPaymentId}`)
      .digest("hex");

    const verifyRes7 = await axios.post(
      `${baseUrl}/verify`,
      {
        razorpay_order_id: order6,
        razorpay_payment_id: p6.razorpayPaymentId,
        razorpay_signature: sig6,
      },
      { headers: authHeaders }
    );

    assert(verifyRes7.status === 200, "Frontend verify returns HTTP 200");
    assert(verifyRes7.data.status === "CREDITED", "Verify response indicates CREDITED");
    const fundsAfterVerify7 = await FundsModel.findOne({ userId: testUser });
    assert(fundsAfterVerify7.availableMargin === 17000.0, "Wallet balance still ₹17,000 (no double credit)");

    // -------------------------------------------------------------
    // TEST 8: Simultaneous Webhook & Frontend Verification
    // -------------------------------------------------------------
    console.log("\n--- 8. Simultaneous Webhook & Verification Race Condition ---");
    const order8 = `order_wc_8_${Date.now()}`;
    const p8 = await seedTestPayment({ orderId: order8, amount: 300000, status: "CREATED" }); // ₹3,000

    // Mock Razorpay SDK fetch for verify
    razorpayClient.payments.fetch = async (id) => ({
      id,
      order_id: order8,
      amount: 300000,
      currency: "INR",
      status: "captured",
      captured: true,
    });

    const sig8 = crypto
      .createHmac("sha256", keySecret)
      .update(`${order8}|${p8.razorpayPaymentId}`)
      .digest("hex");

    const whPayload8 = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: p8.razorpayPaymentId,
            order_id: order8,
            amount: 300000,
            currency: "INR",
            status: "captured",
          },
        },
      },
    };

    // Send both in parallel
    const [raceWh, raceVerify] = await Promise.all([
      sendWebhook({ payload: whPayload8, eventId: `evt_race_${Date.now()}` }),
      axios.post(
        `${baseUrl}/verify`,
        {
          razorpay_order_id: order8,
          razorpay_payment_id: p8.razorpayPaymentId,
          razorpay_signature: sig8,
        },
        { headers: authHeaders }
      ),
    ]);

    assert(raceWh.status === 200 && raceVerify.status === 200, "Both simultaneous requests return HTTP 200");

    const fundsAfterRace8 = await FundsModel.findOne({ userId: testUser });
    assert(
      fundsAfterRace8.availableMargin === 20000.0,
      "Wallet credited exactly once (+₹3,000 to ₹20,000) under race condition"
    );

    const raceLedgerCount = await WalletTransactionModel.countDocuments({ paymentId: p8.internalPaymentId });
    assert(raceLedgerCount === 1, "Exactly 1 ledger transaction created despite race condition");

    // -------------------------------------------------------------
    // TEST 9: Concurrent Different Payments for the Same User
    // -------------------------------------------------------------
    console.log("\n--- 9. Concurrent Different Payments for the Same User ---");
    const order9A = `order_wc_9a_${Date.now()}`;
    const order9B = `order_wc_9b_${Date.now()}`;
    const p9A = await seedTestPayment({ orderId: order9A, amount: 100000, status: "CAPTURED" }); // ₹1,000
    const p9B = await seedTestPayment({ orderId: order9B, amount: 400000, status: "CAPTURED" }); // ₹4,000

    const [concCreditA, concCreditB] = await Promise.all([
      processCapturedPayment({ internalPaymentId: p9A.internalPaymentId }),
      processCapturedPayment({ internalPaymentId: p9B.internalPaymentId }),
    ]);

    assert(concCreditA.success === true && concCreditB.success === true, "Both distinct payments credited");
    const fundsAfterConc = await FundsModel.findOne({ userId: testUser });
    assert(
      fundsAfterConc.availableMargin === 25000.0,
      "Both payments accumulated accurately (+₹1,000 + ₹4,000 = ₹25,000, zero lost updates)"
    );

    // -------------------------------------------------------------
    // TEST 10: Duplicate Razorpay Payment ID Rejection
    // -------------------------------------------------------------
    console.log("\n--- 10. Duplicate Razorpay Payment ID Rejection ---");
    const p10Bogus = await seedTestPayment({
      orderId: `order_bogus_${Date.now()}`,
      paymentId: p1.razorpayPaymentId, // Reusing pay1 ID!
      status: "CAPTURED",
    });

    let dupPayIdError = false;
    try {
      await processCapturedPayment({ internalPaymentId: p10Bogus.internalPaymentId });
    } catch (err) {
      dupPayIdError = true;
    }
    assert(dupPayIdError, "Duplicate razorpayPaymentId rejected by ledger index");

    // -------------------------------------------------------------
    // TEST 11: Amount Mismatch Rejection
    // -------------------------------------------------------------
    console.log("\n--- 11. Amount Mismatch Rejection ---");
    const p11 = await seedTestPayment({
      orderId: `order_mismatch_${Date.now()}`,
      amount: 500000,
      status: "CAPTURED",
    });
    // Set invalid amount directly
    await PaymentModel.updateOne({ _id: p11._id }, { $set: { amount: 0 } });

    let amtMismatchError = false;
    try {
      await processCapturedPayment({ internalPaymentId: p11.internalPaymentId });
    } catch (e) {
      amtMismatchError = true;
    }
    assert(amtMismatchError, "Invalid amount rejected before transaction");

    // -------------------------------------------------------------
    // TEST 12: Currency Mismatch Rejection
    // -------------------------------------------------------------
    console.log("\n--- 12. Currency Mismatch Rejection ---");
    const p12 = await seedTestPayment({
      orderId: `order_usd_${Date.now()}`,
      status: "CAPTURED",
    });
    await PaymentModel.updateOne({ _id: p12._id }, { $set: { currency: "USD" } });

    let currMismatchError = false;
    try {
      await processCapturedPayment({ internalPaymentId: p12.internalPaymentId });
    } catch (e) {
      currMismatchError = true;
    }
    assert(currMismatchError, "Non-INR currency rejected");

    // -------------------------------------------------------------
    // TEST 13: Uncaptured Payment Rejection
    // -------------------------------------------------------------
    console.log("\n--- 13. Uncaptured Payment Rejection ---");
    const p13 = await seedTestPayment({
      orderId: `order_uncap_${Date.now()}`,
      status: "PENDING", // Not captured!
    });

    let uncapError = false;
    try {
      await processCapturedPayment({ internalPaymentId: p13.internalPaymentId });
    } catch (e) {
      uncapError = true;
    }
    assert(uncapError, "Uncaptured payment rejected from wallet crediting");

    // -------------------------------------------------------------
    // TEST 14: Failed Payment Rejection
    // -------------------------------------------------------------
    console.log("\n--- 14. Failed Payment Rejection ---");
    const p14 = await seedTestPayment({
      orderId: `order_failed_${Date.now()}`,
      status: "FAILED",
    });

    let failedPaymentError = false;
    try {
      await processCapturedPayment({ internalPaymentId: p14.internalPaymentId });
    } catch (e) {
      failedPaymentError = true;
    }
    assert(failedPaymentError, "Failed payment rejected from wallet crediting");

    // -------------------------------------------------------------
    // TEST 15, 16, 17: MongoDB Transaction Rollback & Failure Recovery
    // -------------------------------------------------------------
    console.log("\n--- 15-17. Transaction Rollback & Failure Recovery ---");
    const p15 = await seedTestPayment({
      orderId: `order_rollback_${Date.now()}`,
      amount: 500000,
      status: "CAPTURED",
    });

    // Mock WalletTransactionModel.create to fail inside transaction
    const originalTxCreate = WalletTransactionModel.create;
    WalletTransactionModel.create = async () => {
      throw new Error("Simulated database write error during transaction");
    };

    let txFailed = false;
    try {
      await processCapturedPayment({ internalPaymentId: p15.internalPaymentId });
    } catch (e) {
      txFailed = true;
    } finally {
      WalletTransactionModel.create = originalTxCreate;
    }

    assert(txFailed, "Transaction threw error when operation inside failed");

    // Verify rollback: balance was NOT incremented, payment status remains CAPTURED
    const fundsAfterAbort = await FundsModel.findOne({ userId: testUser });
    assert(fundsAfterAbort.availableMargin === 25000.0, "Wallet balance was NOT incremented (rolled back)");

    const p15AfterAbort = await PaymentModel.findOne({ internalPaymentId: p15.internalPaymentId });
    assert(p15AfterAbort.status === "CAPTURED", "Payment status remained CAPTURED (eligible for retry)");

    // -------------------------------------------------------------
    // TEST 18: Retry After Failure Succeeds
    // -------------------------------------------------------------
    console.log("\n--- 18. Retry After Failure Succeeds ---");
    const retryRes18 = await processCapturedPayment({ internalPaymentId: p15.internalPaymentId });
    assert(retryRes18.success === true, "Retry after failed transaction succeeds");
    const fundsAfterRetry = await FundsModel.findOne({ userId: testUser });
    assert(fundsAfterRetry.availableMargin === 30000.0, "Wallet balance now credited to ₹30,000 on retry");

    // -------------------------------------------------------------
    // TEST 19, 20: Existing BUY and SELL Order Functionality Preservation
    // -------------------------------------------------------------
    console.log("\n--- 19-20. Existing Trading Functionality Preservation ---");
    // Execute a BUY order using credited funds
    const buyResult = await processOrder({
      userId: testUser,
      name: "TCS",
      qty: 2,
      price: 3500.0, // ₹7,000 total
      mode: "BUY",
      product: "CNC",
    });

    assert(buyResult.success === true, "BUY order executed successfully using Razorpay-credited funds");
    const fundsAfterBuy = await FundsModel.findOne({ userId: testUser });
    assert(
      fundsAfterBuy.availableMargin === 23000.0,
      "Wallet margin accurately deducted: ₹30,000 - ₹7,000 = ₹23,000"
    );

    // Execute a SELL order
    const sellResult = await processOrder({
      userId: testUser,
      name: "TCS",
      qty: 1,
      price: 3600.0, // Sell 1 share at profit (+₹3,600)
      mode: "SELL",
      product: "CNC",
    });

    assert(sellResult.success === true, "SELL order executed successfully");
    const fundsAfterSell = await FundsModel.findOne({ userId: testUser });
    assert(
      fundsAfterSell.availableMargin === 26600.0,
      "Wallet margin accurately incremented: ₹23,000 + ₹3,600 = ₹26,600"
    );

    // -------------------------------------------------------------
    // TEST 21, 22: Socket.IO Real-time Updates Verification
    // -------------------------------------------------------------
    console.log("\n--- 21-22. Socket.IO Real-time Updates ---");
    const userBroadcasts = socketBroadcasts.filter((b) => b.userId === testUser);
    assert(userBroadcasts.length > 0, "Socket.IO updates emitted to user room after successful transaction");

    // Clear broadcast count to verify no emit on failure
    socketBroadcasts.length = 0;

    // Simulate failure
    WalletTransactionModel.create = async () => {
      throw new Error("Simulated failure to verify no socket broadcast");
    };

    const pFail = await seedTestPayment({
      orderId: `order_socket_fail_${Date.now()}`,
      status: "CAPTURED",
    });

    try {
      await processCapturedPayment({ internalPaymentId: pFail.internalPaymentId });
    } catch (e) {
      // Expected failure
    } finally {
      WalletTransactionModel.create = originalTxCreate;
    }

    assert(
      socketBroadcasts.length === 0,
      "No Socket.IO broadcast emitted when transaction failed/aborted"
    );

    // -------------------------------------------------------------
    // TEST 23: Secret Leakage Prevention
    // -------------------------------------------------------------
    console.log("\n--- 23. Secret Leakage Prevention ---");
    const combinedResponses = JSON.stringify(allResponsePayloads);
    const leaksWhSecret = TEST_WEBHOOK_SECRET && combinedResponses.includes(TEST_WEBHOOK_SECRET);
    const leaksKeySecret = keySecret && combinedResponses.includes(keySecret);
    const leaksMongoUri = mongoUri && combinedResponses.includes(mongoUri);

    assert(!leaksWhSecret, "Webhook secret is NOT leaked in any response payload");
    assert(!leaksKeySecret, "Key secret is NOT leaked in responses");
    assert(!leaksMongoUri, "MongoDB URI is NOT leaked in responses");

  } catch (err) {
    console.error("Unexpected test failure:", err);
    failed++;
  } finally {
    // Clean up test data
    console.log("\n--> Cleaning up wallet crediting test documents for user:", testUser);
    await FundsModel.deleteMany({ userId: testUser });
    await WalletTransactionModel.deleteMany({ userId: testUser });
    await PaymentModel.deleteMany({ userId: testUser });
    await OrdersModel.deleteMany({ userId: testUser });
    await HoldingsModel.deleteMany({ userId: testUser });
    await PositionsModel.deleteMany({ userId: testUser });
    await WebhookEventModel.deleteMany({ razorpayEventId: /^evt_/ });

    server.close();
    await mongoose.connection.close();
    console.log("--> Server closed and MongoDB disconnected.\n");

    console.log("================================================================");
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("================================================================");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runWalletCreditingTestSuite();
