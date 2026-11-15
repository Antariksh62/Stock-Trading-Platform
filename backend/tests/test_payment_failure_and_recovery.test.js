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

const paymentRoutes = require("../routes/paymentRoutes");
const webhookRoutes = require("../routes/webhookRoutes");
const { razorpayClient, getRazorpayCredentials } = require("../config/razorpay");
const { processCapturedPayment } = require("../services/paymentProcessingService");
const { setBroadcastHandler } = require("../services/socketService");

async function runPaymentFailureAndRecoveryTestSuite() {
  console.log("================================================================");
  console.log("   PAYMENT FAILURE & RECOVERY HANDLING INTEGRATION TEST SUITE   ");
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

  // 2. Setup Test Server
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

  const server = http.createServer(app);
  const port = 59630;
  await new Promise((resolve) => server.listen(port, resolve));
  const baseUrl = `http://localhost:${port}`;
  console.log(`--> Test Server listening at ${baseUrl}\n`);

  // Create test users
  const userAliceId = `user_alice_recov_${Date.now()}`;
  const userBobId = `user_bob_recov_${Date.now()}`;

  const tokenAlice = jwt.sign({ id: userAliceId }, process.env.TOKEN_KEY, { expiresIn: "1h" });
  const tokenBob = jwt.sign({ id: userBobId }, process.env.TOKEN_KEY, { expiresIn: "1h" });

  const headersAlice = { Authorization: `Bearer ${tokenAlice}` };
  const headersBob = { Authorization: `Bearer ${tokenBob}` };

  // Seed funds for Alice (₹10,000)
  await FundsModel.create({
    userId: userAliceId,
    availableCash: 10000,
    availableMargin: 10000,
    openingBalance: 10000,
    payin: 10000,
  });

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const keySecret = getRazorpayCredentials().keySecret;

  // Helper to post webhook
  const postWebhook = async (payload, eventId) => {
    const rawBody = JSON.stringify(payload);
    const signature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    return axios.post(`${baseUrl}/api/webhooks/razorpay`, rawBody, {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": eventId,
      },
    });
  };

  // Mock SDK methods for simulated outcomes
  const originalFetch = razorpayClient.payments.fetch;
  const originalFetchPayments = razorpayClient.orders.fetchPayments;

  // -------------------------------------------------------------
  // TEST 1: User Closes Checkout Window Without Paying
  // -------------------------------------------------------------
  console.log("--- 1. User Closes Checkout Window Without Paying ---");
  const orderRes1 = await axios.post(
    `${baseUrl}/api/payments/create-order`,
    { amount: 5000 },
    { headers: headersAlice }
  );
  assert(orderRes1.status === 201, "1a. Order created successfully");
  const orderId1 = orderRes1.data.orderId;

  // User closes checkout; status endpoint is called
  const statusRes1 = await axios.get(
    `${baseUrl}/api/payments/status/${orderId1}`,
    { headers: headersAlice }
  );
  assert(statusRes1.status === 200, "1b. Status check returns HTTP 200");
  assert(statusRes1.data.status === "CREATED", "1c. Order remains in CREATED state");
  assert(statusRes1.data.walletCredited === false, "1d. Wallet was NOT credited");

  const funds1 = await FundsModel.findOne({ userId: userAliceId });
  assert(funds1.availableMargin === 10000, "1e. Wallet balance unchanged at ₹10,000");

  // -------------------------------------------------------------
  // TEST 2: Payment Fails at Gateway
  // -------------------------------------------------------------
  console.log("\n--- 2. Payment Fails at Gateway ---");
  const orderRes2 = await axios.post(
    `${baseUrl}/api/payments/create-order`,
    { amount: 3000 },
    { headers: headersAlice }
  );
  const orderId2 = orderRes2.data.orderId;
  const failPayId2 = `pay_fail_${Date.now()}`;

  // Mock gateway returning failed payment on fetch
  razorpayClient.payments.fetch = async () => ({
    id: failPayId2,
    order_id: orderId2,
    amount: 300000,
    currency: "INR",
    status: "failed",
    error_description: "Insufficient account balance in bank",
  });

  const failSig2 = crypto.createHmac("sha256", keySecret).update(`${orderId2}|${failPayId2}`).digest("hex");
  try {
    await axios.post(
      `${baseUrl}/api/payments/verify`,
      {
        razorpay_order_id: orderId2,
        razorpay_payment_id: failPayId2,
        razorpay_signature: failSig2,
      },
      { headers: headersAlice }
    );
    assert(false, "2a. Verification of failed payment should return 400");
  } catch (err) {
    assert(err.response?.status === 400, "2a. Verification returns HTTP 400");
    assert(err.response?.data?.status === "FAILED", "2b. Response conveys FAILED status");
  }

  // Check status endpoint after failure
  const statusRes2 = await axios.get(
    `${baseUrl}/api/payments/status/${orderId2}`,
    { headers: headersAlice }
  );
  assert(statusRes2.data.status === "FAILED", "2c. Status endpoint confirms FAILED");
  assert(statusRes2.data.walletCredited === false, "2d. Wallet was NOT credited on failure");

  // -------------------------------------------------------------
  // TEST 3: Payment Succeeds but Frontend Loses Response (Recovery via Status Check)
  // -------------------------------------------------------------
  console.log("\n--- 3. Payment Succeeds but Frontend Loses Response (Status Endpoint Recovery) ---");
  const orderRes3 = await axios.post(
    `${baseUrl}/api/payments/create-order`,
    { amount: 4000 },
    { headers: headersAlice }
  );
  const orderId3 = orderRes3.data.orderId;
  const capturedPayId3 = `pay_cap_recov_${Date.now()}`;

  // Gateway has captured the payment, but client disconnected before /verify completed
  razorpayClient.orders.fetchPayments = async (oId) => ({
    entity: "collection",
    count: 1,
    items: [
      {
        id: capturedPayId3,
        order_id: oId,
        amount: 400000,
        currency: "INR",
        status: "captured",
        method: "upi",
        created_at: Math.floor(Date.now() / 1000),
      },
    ],
  });

  // Client recovers by checking status
  const recoveryRes3 = await axios.get(
    `${baseUrl}/api/payments/status/${orderId3}`,
    { headers: headersAlice }
  );

  assert(recoveryRes3.status === 200, "3a. Status endpoint returns HTTP 200");
  assert(recoveryRes3.data.status === "CREDITED", "3b. Authoritative reconciliation marked status CREDITED");
  assert(recoveryRes3.data.walletCredited === true, "3c. Response confirms wallet was credited");
  assert(recoveryRes3.data.reconciled === true, "3d. Marked as reconciled via gateway");

  const funds3 = await FundsModel.findOne({ userId: userAliceId });
  assert(funds3.availableMargin === 14000, "3e. Wallet balance incremented accurately (+₹4,000 -> ₹14,000)");

  // -------------------------------------------------------------
  // TEST 4: Backend Verification Times Out (Recovery via Webhook)
  // -------------------------------------------------------------
  console.log("\n--- 4. Backend Verification Times Out (Recovery via Webhook) ---");
  const orderRes4 = await axios.post(
    `${baseUrl}/api/payments/create-order`,
    { amount: 2000 },
    { headers: headersAlice }
  );
  const orderId4 = orderRes4.data.orderId;
  const capturedPayId4 = `pay_cap_wh_${Date.now()}`;

  // Webhook arrives asynchronously
  const evt4Id = `evt_wh_recov_${Date.now()}`;
  await postWebhook(
    {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: capturedPayId4,
            order_id: orderId4,
            amount: 200000,
            currency: "INR",
            status: "captured",
          },
        },
      },
    },
    evt4Id
  );

  const statusRes4 = await axios.get(
    `${baseUrl}/api/payments/status/${orderId4}`,
    { headers: headersAlice }
  );
  assert(statusRes4.data.status === "CREDITED", "4a. Webhook successfully credited payment (status CREDITED)");
  const funds4 = await FundsModel.findOne({ userId: userAliceId });
  assert(funds4.availableMargin === 16000, "4b. Wallet balance accurately updated to ₹16,000");

  // -------------------------------------------------------------
  // TEST 5: Webhook Arrives Before Frontend Verification (Race Condition)
  // -------------------------------------------------------------
  console.log("\n--- 5. Webhook Arrives Before Frontend Verification ---");
  const orderRes5 = await axios.post(
    `${baseUrl}/api/payments/create-order`,
    { amount: 1000 },
    { headers: headersAlice }
  );
  const orderId5 = orderRes5.data.orderId;
  const payId5 = `pay_race_whfirst_${Date.now()}`;

  // Step 1: Webhook arrives first
  await postWebhook(
    {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: payId5,
            order_id: orderId5,
            amount: 100000,
            currency: "INR",
            status: "captured",
          },
        },
      },
    },
    `evt_race_5_${Date.now()}`
  );

  // Step 2: Frontend verify arrives second
  const sig5 = crypto.createHmac("sha256", keySecret).update(`${orderId5}|${payId5}`).digest("hex");
  const verifyRes5 = await axios.post(
    `${baseUrl}/api/payments/verify`,
    {
      razorpay_order_id: orderId5,
      razorpay_payment_id: payId5,
      razorpay_signature: sig5,
    },
    { headers: headersAlice }
  );

  assert(verifyRes5.status === 200, "5a. Late verify returns HTTP 200");
  assert(verifyRes5.data.status === "CREDITED", "5b. Status remains CREDITED");
  const funds5 = await FundsModel.findOne({ userId: userAliceId });
  assert(funds5.availableMargin === 17000, "5c. Wallet balance credited exactly once (+₹1,000 -> ₹17,000)");

  // -------------------------------------------------------------
  // TEST 6: Frontend Verification Arrives Before Webhook
  // -------------------------------------------------------------
  console.log("\n--- 6. Frontend Verification Arrives Before Webhook ---");
  const orderRes6 = await axios.post(
    `${baseUrl}/api/payments/create-order`,
    { amount: 1500 },
    { headers: headersAlice }
  );
  const orderId6 = orderRes6.data.orderId;
  const payId6 = `pay_race_verifyfirst_${Date.now()}`;

  razorpayClient.payments.fetch = async () => ({
    id: payId6,
    order_id: orderId6,
    amount: 150000,
    currency: "INR",
    status: "captured",
  });

  const sig6 = crypto.createHmac("sha256", keySecret).update(`${orderId6}|${payId6}`).digest("hex");
  const verifyRes6 = await axios.post(
    `${baseUrl}/api/payments/verify`,
    {
      razorpay_order_id: orderId6,
      razorpay_payment_id: payId6,
      razorpay_signature: sig6,
    },
    { headers: headersAlice }
  );
  assert(verifyRes6.status === 200, "6a. Verify succeeds first (HTTP 200)");

  // Late webhook arrives
  const evt6Id = `evt_late_wh_6_${Date.now()}`;
  await postWebhook(
    {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: payId6,
            order_id: orderId6,
            amount: 150000,
            currency: "INR",
            status: "captured",
          },
        },
      },
    },
    evt6Id
  );

  const funds6 = await FundsModel.findOne({ userId: userAliceId });
  assert(funds6.availableMargin === 18500, "6b. Wallet credited exactly once (+₹1,500 -> ₹18,500)");

  // -------------------------------------------------------------
  // TEST 7: Duplicate Verification Requests
  // -------------------------------------------------------------
  console.log("\n--- 7. Duplicate Verification Requests (Idempotency) ---");
  const dupVerifyRes = await axios.post(
    `${baseUrl}/api/payments/verify`,
    {
      razorpay_order_id: orderId6,
      razorpay_payment_id: payId6,
      razorpay_signature: sig6,
    },
    { headers: headersAlice }
  );
  assert(dupVerifyRes.status === 200, "7a. Duplicate verification returns HTTP 200");
  assert(dupVerifyRes.data.status === "CREDITED", "7b. Preserves CREDITED status");
  const funds7 = await FundsModel.findOne({ userId: userAliceId });
  assert(funds7.availableMargin === 18500, "7c. Wallet balance strictly unchanged");

  // -------------------------------------------------------------
  // TEST 8: Duplicate Webhook Deliveries
  // -------------------------------------------------------------
  console.log("\n--- 8. Duplicate Webhook Deliveries ---");
  const dupWhRes = await postWebhook(
    {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: payId6,
            order_id: orderId6,
            amount: 150000,
            currency: "INR",
            status: "captured",
          },
        },
      },
    },
    evt6Id // Same event ID
  );
  assert(dupWhRes.status === 200, "8a. Duplicate webhook returns HTTP 200");
  assert(dupWhRes.data.isDuplicate === true, "8b. Marked isDuplicate: true");

  // -------------------------------------------------------------
  // TEST 9: Delayed or Out-of-Order Webhook Events (Never Downgrade CREDITED)
  // -------------------------------------------------------------
  console.log("\n--- 9. Out-of-Order Events (Never Downgrade CREDITED) ---");
  // Send delayed payment.authorized on CREDITED payment
  await postWebhook(
    {
      event: "payment.authorized",
      payload: {
        payment: {
          entity: {
            id: payId6,
            order_id: orderId6,
            amount: 150000,
            currency: "INR",
          },
        },
      },
    },
    `evt_out_of_order_auth_${Date.now()}`
  );
  const pCheckAfterAuth = await PaymentModel.findOne({ razorpayOrderId: orderId6 });
  assert(pCheckAfterAuth.status === "CREDITED", "9a. Delayed payment.authorized NEVER overwrites CREDITED with PENDING");

  // Send delayed payment.failed on CREDITED payment
  await postWebhook(
    {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: payId6,
            order_id: orderId6,
            amount: 150000,
            currency: "INR",
            error_description: "Late simulated failure",
          },
        },
      },
    },
    `evt_out_of_order_fail_${Date.now()}`
  );
  const pCheckAfterFail = await PaymentModel.findOne({ razorpayOrderId: orderId6 });
  assert(pCheckAfterFail.status === "CREDITED", "9b. Delayed payment.failed NEVER overwrites CREDITED with FAILED");

  // -------------------------------------------------------------
  // TEST 10: Status Endpoint Ownership Check
  // -------------------------------------------------------------
  console.log("\n--- 10. Status Endpoint Ownership Enforcement ---");
  try {
    // User Bob tries to check Alice's order
    await axios.get(`${baseUrl}/api/payments/status/${orderId6}`, { headers: headersBob });
    assert(false, "10a. Cross-user status check should fail");
  } catch (err) {
    assert(err.response?.status === 403, "10a. Cross-user status check rejected with HTTP 403 Forbidden");
    assert(err.response?.data?.message.includes("Access denied"), "10b. Explains ownership violation");
  }

  try {
    // Unauthenticated status check
    await axios.get(`${baseUrl}/api/payments/status/${orderId6}`);
    assert(false, "10c. Unauthenticated status check should fail");
  } catch (err) {
    assert(err.response?.status === 401, "10c. Unauthenticated status check rejected with HTTP 401");
  }

  // -------------------------------------------------------------
  // TEST 11: Non-Existent Order Status Check
  // -------------------------------------------------------------
  console.log("\n--- 11. Non-Existent Order Status Check ---");
  try {
    await axios.get(`${baseUrl}/api/payments/status/order_fake_never_existed`, { headers: headersAlice });
    assert(false, "11a. Unknown order status check should fail");
  } catch (err) {
    assert(err.response?.status === 404, "11a. Unknown order returns HTTP 404 Not Found");
  }

  // -------------------------------------------------------------
  // TEST 12: Idempotent Status Inquiries on Credited Orders
  // -------------------------------------------------------------
  console.log("\n--- 12. Idempotent Repeated Status Checks ---");
  const repStatus1 = await axios.get(`${baseUrl}/api/payments/status/${orderId6}`, { headers: headersAlice });
  const repStatus2 = await axios.get(`${baseUrl}/api/payments/status/${orderId6}`, { headers: headersAlice });
  assert(repStatus1.data.status === "CREDITED" && repStatus2.data.status === "CREDITED", "12a. Both status checks report CREDITED");
  const fundsFinal = await FundsModel.findOne({ userId: userAliceId });
  assert(fundsFinal.availableMargin === 18500, "12b. Wallet balance remains strictly at ₹18,500");

  // -------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------
  razorpayClient.payments.fetch = originalFetch;
  razorpayClient.orders.fetchPayments = originalFetchPayments;

  await PaymentModel.deleteMany({ userId: { $in: [userAliceId, userBobId] } });
  await FundsModel.deleteMany({ userId: { $in: [userAliceId, userBobId] } });
  await WalletTransactionModel.deleteMany({ userId: { $in: [userAliceId, userBobId] } });
  await WebhookEventModel.deleteMany({ razorpayOrderId: { $in: [orderId1, orderId2, orderId3, orderId4, orderId5, orderId6] } });

  await new Promise((r) => server.close(r));
  await mongoose.disconnect();

  console.log("\n================================================================");
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPaymentFailureAndRecoveryTestSuite().catch((err) => {
  console.error("Test Suite Unhandled Rejection:", err);
  process.exit(1);
});
