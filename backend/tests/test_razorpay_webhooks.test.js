const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config();

const http = require("http");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const axios = require("axios");

const { PaymentModel } = require("../model/PaymentModel");
const { WebhookEventModel } = require("../model/WebhookEventModel");
const webhookRoutes = require("../routes/webhookRoutes");
const paymentRoutes = require("../routes/paymentRoutes");
const {
  receiveAndProcessWebhook,
  recoverStaleWebhookEvents,
} = require("../services/webhookService");
const { getRazorpayCredentials } = require("../config/razorpay");

async function runWebhookTestSuite() {
  console.log("================================================================");
  console.log("       RAZORPAY WEBHOOK INTEGRATION TEST SUITE                  ");
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

  // 1. Connect to MongoDB
  const mongoUri = process.env.MONGO_URL;
  if (!mongoUri) {
    console.error("FATAL: MONGO_URL not defined in .env");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  try {
    await WebhookEventModel.syncIndexes();
    await PaymentModel.syncIndexes();
  } catch (e) {
    await WebhookEventModel.init();
    await PaymentModel.init();
  }
  console.log("--> MongoDB Atlas Connected and collections synchronized.\n");

  // 2. Set up ephemeral Express test app matching production middleware order
  const app = express();
  app.use(cookieParser());

  // Webhook raw-body middleware mounted BEFORE bodyParser.json
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

  // Standard JSON body parser with rawBody preservation
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
  const webhookUrl = `http://localhost:${port}/api/webhooks/razorpay`;
  console.log(`--> Ephemeral Test Server running on port ${port} (${webhookUrl})\n`);

  // Dedicated test secret for deterministic webhook signature verification
  const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_automated_testing_123456";
  const { keySecret } = getRazorpayCredentials();

  // Override webhook secret dynamically in test environment
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

  const allResponsePayloads = [];

  // Helper to post webhook with computed HMAC-SHA256 signature
  const postWebhook = async ({
    payload,
    eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    signatureOverride = null,
    secret = TEST_WEBHOOK_SECRET,
    rawStringOverride = null,
    omitSignature = false,
    omitEventId = false,
  }) => {
    const rawBody =
      rawStringOverride !== null
        ? rawStringOverride
        : typeof payload === "string"
        ? payload
        : JSON.stringify(payload);

    let signature = signatureOverride;
    if (!signature && !omitSignature) {
      signature = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");
    }

    const headers = {
      "Content-Type": "application/json",
    };
    if (!omitSignature && signature) {
      headers["x-razorpay-signature"] = signature;
    }
    if (!omitEventId && eventId) {
      headers["x-razorpay-event-id"] = eventId;
    }

    try {
      const res = await axios.post(webhookUrl, rawBody, { headers });
      allResponsePayloads.push(res.data);
      return res;
    } catch (err) {
      allResponsePayloads.push(err.response?.data);
      return err.response;
    }
  };

  // Helper to seed internal payment
  const seedPayment = async ({
    orderId,
    internalId = `PAY_WH_${Date.now()}`,
    amount = 500000,
    status = "CREATED",
    currency = "INR",
    userId = `user_wh_${Date.now()}`,
  }) => {
    await PaymentModel.deleteOne({ razorpayOrderId: orderId });
    return await PaymentModel.create({
      userId,
      internalPaymentId: internalId,
      razorpayOrderId: orderId,
      amount,
      currency,
      status,
    });
  };

  try {
    // -------------------------------------------------------------
    // TEST 1: Valid Webhook Signature
    // -------------------------------------------------------------
    console.log("--- 1. Valid Webhook Signature ---");
    const evt1Id = `evt_test_1_${Date.now()}`;
    const order1 = `order_wh_1_${Date.now()}`;
    const pay1 = `pay_wh_1_${Date.now()}`;
    await seedPayment({ orderId: order1, amount: 500000 });

    const payload1 = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: pay1,
            order_id: order1,
            amount: 500000,
            currency: "INR",
            status: "captured",
            method: "upi",
          },
        },
      },
    };

    const res1 = await postWebhook({ payload: payload1, eventId: evt1Id });
    assert(res1.status === 200, "Valid webhook signature returns HTTP 200");
    assert(res1.data.success === true, "Response success is true");
    const dbEvt1 = await WebhookEventModel.findOne({ razorpayEventId: evt1Id });
    assert(dbEvt1 !== null, "Webhook event successfully persisted in MongoDB");
    assert(dbEvt1?.processingStatus === "PROCESSED", "Event marked PROCESSED");

    // -------------------------------------------------------------
    // TEST 2: Invalid Webhook Signature
    // -------------------------------------------------------------
    console.log("\n--- 2. Invalid Webhook Signature ---");
    const badSig = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const res2 = await postWebhook({
      payload: payload1,
      signatureOverride: badSig,
      eventId: `evt_bad_sig_${Date.now()}`,
    });
    assert(res2.status === 400, "Invalid signature returns HTTP 400");
    assert(res2.data.message.includes("Invalid webhook signature"), "Clean signature failure message");

    // -------------------------------------------------------------
    // TEST 3: Missing Webhook Signature
    // -------------------------------------------------------------
    console.log("\n--- 3. Missing Webhook Signature ---");
    const res3 = await postWebhook({
      payload: payload1,
      omitSignature: true,
      eventId: `evt_no_sig_${Date.now()}`,
    });
    assert(res3.status === 400, "Missing signature header returns HTTP 400");

    // -------------------------------------------------------------
    // TEST 4: Missing Event ID Header
    // -------------------------------------------------------------
    console.log("\n--- 4. Missing Event ID Header ---");
    const res4 = await postWebhook({
      payload: payload1,
      omitEventId: true,
    });
    assert(res4.status === 400, "Missing event ID header returns HTTP 400");

    // -------------------------------------------------------------
    // TEST 5: Malformed JSON Payload
    // -------------------------------------------------------------
    console.log("\n--- 5. Malformed JSON Payload ---");
    const res5 = await postWebhook({
      rawStringOverride: '{"event": "payment.captured", malformed_json',
      eventId: `evt_malformed_${Date.now()}`,
    });
    assert(res5.status === 400, "Malformed JSON returns HTTP 400");

    // -------------------------------------------------------------
    // TEST 6: Valid payment.authorized Event
    // -------------------------------------------------------------
    console.log("\n--- 6. Valid payment.authorized Event ---");
    const order6 = `order_wh_6_${Date.now()}`;
    const pay6 = `pay_wh_6_${Date.now()}`;
    await seedPayment({ orderId: order6, status: "CREATED" });

    const payload6 = {
      event: "payment.authorized",
      payload: {
        payment: {
          entity: {
            id: pay6,
            order_id: order6,
            amount: 500000,
            currency: "INR",
            status: "authorized",
            method: "card",
          },
        },
      },
    };

    const res6 = await postWebhook({ payload: payload6, eventId: `evt_auth_${Date.now()}` });
    assert(res6.status === 200, "payment.authorized returns HTTP 200");
    const dbPayment6 = await PaymentModel.findOne({ razorpayOrderId: order6 });
    assert(dbPayment6.status === "PENDING", "Payment transitioned from CREATED -> PENDING on payment.authorized");

    // -------------------------------------------------------------
    // TEST 7: Valid payment.captured Event
    // -------------------------------------------------------------
    console.log("\n--- 7. Valid payment.captured Event ---");
    const order7 = `order_wh_7_${Date.now()}`;
    const pay7 = `pay_wh_7_${Date.now()}`;
    await seedPayment({ orderId: order7, status: "PENDING", amount: 200000 });

    const payload7 = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: pay7,
            order_id: order7,
            amount: 200000,
            currency: "INR",
            status: "captured",
            method: "netbanking",
          },
        },
      },
    };

    const res7 = await postWebhook({ payload: payload7, eventId: `evt_cap_${Date.now()}` });
    assert(res7.status === 200, "payment.captured returns HTTP 200");
    const dbPayment7 = await PaymentModel.findOne({ razorpayOrderId: order7 });
    assert(
      dbPayment7.status === "CAPTURED" || dbPayment7.status === "CREDITED",
      "Payment transitioned to CAPTURED or CREDITED"
    );
    assert(dbPayment7.capturedAt !== null, "Payment capturedAt is populated");

    // -------------------------------------------------------------
    // TEST 8: Valid payment.failed Event
    // -------------------------------------------------------------
    console.log("\n--- 8. Valid payment.failed Event ---");
    const order8 = `order_wh_8_${Date.now()}`;
    const pay8 = `pay_wh_8_${Date.now()}`;
    await seedPayment({ orderId: order8, status: "CREATED" });

    const payload8 = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: pay8,
            order_id: order8,
            amount: 500000,
            currency: "INR",
            status: "failed",
            error_description: "Insufficient account balance",
          },
        },
      },
    };

    const res8 = await postWebhook({ payload: payload8, eventId: `evt_fail_${Date.now()}` });
    assert(res8.status === 200, "payment.failed returns HTTP 200");
    const dbPayment8 = await PaymentModel.findOne({ razorpayOrderId: order8 });
    assert(dbPayment8.status === "FAILED", "Payment transitioned to FAILED");

    // -------------------------------------------------------------
    // TEST 9: Valid order.paid Event
    // -------------------------------------------------------------
    console.log("\n--- 9. Valid order.paid Event ---");
    const order9 = `order_wh_9_${Date.now()}`;
    await seedPayment({ orderId: order9, status: "CREATED", amount: 750000 });

    const payload9 = {
      event: "order.paid",
      payload: {
        order: {
          entity: {
            id: order9,
            amount_paid: 750000,
            status: "paid",
          },
        },
      },
    };

    const res9 = await postWebhook({ payload: payload9, eventId: `evt_orderpaid_${Date.now()}` });
    assert(res9.status === 200, "order.paid returns HTTP 200");
    const dbPayment9 = await PaymentModel.findOne({ razorpayOrderId: order9 });
    assert(
      dbPayment9.status === "CAPTURED" || dbPayment9.status === "CREDITED",
      "order.paid updates payment to CAPTURED or CREDITED"
    );

    // -------------------------------------------------------------
    // TEST 10: Duplicate Webhook Delivery (Idempotency)
    // -------------------------------------------------------------
    console.log("\n--- 10. Duplicate Webhook Delivery ---");
    const dupEvtId = `evt_dup_test_${Date.now()}`;
    const res10a = await postWebhook({ payload: payload7, eventId: dupEvtId });
    assert(res10a.status === 200, "Initial delivery returns HTTP 200");

    const res10b = await postWebhook({ payload: payload7, eventId: dupEvtId });
    assert(res10b.status === 200, "Duplicate delivery returns HTTP 200");
    assert(res10b.data.isDuplicate === true, "Duplicate delivery detected and marked isDuplicate: true");

    const countEvt10 = await WebhookEventModel.countDocuments({ razorpayEventId: dupEvtId });
    assert(countEvt10 === 1, "Exactly 1 record exists in WebhookEvent collection for duplicate event ID");

    // -------------------------------------------------------------
    // TEST 11: Concurrent Duplicate Webhook Delivery
    // -------------------------------------------------------------
    console.log("\n--- 11. Concurrent Duplicate Delivery ---");
    const concEvtId = `evt_concurrent_${Date.now()}`;
    const [concA, concB] = await Promise.all([
      postWebhook({ payload: payload7, eventId: concEvtId }),
      postWebhook({ payload: payload7, eventId: concEvtId }),
    ]);

    assert(concA.status === 200 && concB.status === 200, "Both concurrent webhook calls return HTTP 200");
    const concCount = await WebhookEventModel.countDocuments({ razorpayEventId: concEvtId });
    assert(concCount === 1, "Exactly 1 record persisted under race conditions (No duplicate key crashes)");

    // -------------------------------------------------------------
    // TEST 12: Out-of-Order Authorized and Captured Events
    // -------------------------------------------------------------
    console.log("\n--- 12. Out-of-Order Events (Captured arrives before Authorized) ---");
    const order12 = `order_wh_12_${Date.now()}`;
    const pay12 = `pay_wh_12_${Date.now()}`;
    await seedPayment({ orderId: order12, status: "CREATED", amount: 350000 });

    // Step 1: Captured arrives first
    const payload12Captured = {
      event: "payment.captured",
      payload: { payment: { entity: { id: pay12, order_id: order12, amount: 350000, currency: "INR" } } },
    };
    await postWebhook({ payload: payload12Captured, eventId: `evt_12_cap_${Date.now()}` });
    const db12AfterCap = await PaymentModel.findOne({ razorpayOrderId: order12 });
    assert(
      db12AfterCap.status === "CAPTURED" || db12AfterCap.status === "CREDITED",
      "Payment reached CAPTURED or CREDITED"
    );

    // Step 2: Delayed Authorized arrives second
    const payload12Auth = {
      event: "payment.authorized",
      payload: { payment: { entity: { id: pay12, order_id: order12, amount: 350000, currency: "INR" } } },
    };
    await postWebhook({ payload: payload12Auth, eventId: `evt_12_auth_${Date.now()}` });
    const db12AfterAuth = await PaymentModel.findOne({ razorpayOrderId: order12 });
    assert(
      db12AfterAuth.status === "CAPTURED" || db12AfterAuth.status === "CREDITED",
      "Delayed payment.authorized does NOT overwrite CAPTURED with PENDING"
    );

    // -------------------------------------------------------------
    // TEST 13: Delayed Failed Event After Captured Payment
    // -------------------------------------------------------------
    console.log("\n--- 13. Delayed Failed Event After Captured Payment ---");
    const order13 = `order_wh_13_${Date.now()}`;
    const pay13 = `pay_wh_13_${Date.now()}`;
    await seedPayment({ orderId: order13, status: "CAPTURED", amount: 450000 });

    const payload13Fail = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: pay13,
            order_id: order13,
            amount: 450000,
            currency: "INR",
            error_description: "Late failure notification",
          },
        },
      },
    };
    await postWebhook({ payload: payload13Fail, eventId: `evt_13_fail_${Date.now()}` });
    const db13 = await PaymentModel.findOne({ razorpayOrderId: order13 });
    assert(db13.status === "CAPTURED", "CAPTURED payment NEVER downgraded to FAILED by delayed webhook");

    // -------------------------------------------------------------
    // TEST 14: Captured Payment Already Verified by Frontend
    // -------------------------------------------------------------
    console.log("\n--- 14. Captured Payment Already Verified by Frontend ---");
    const order14 = `order_wh_14_${Date.now()}`;
    const pay14 = `pay_wh_14_${Date.now()}`;
    await seedPayment({ orderId: order14, status: "CAPTURED" });

    const res14 = await postWebhook({
      payload: {
        event: "payment.captured",
        payload: { payment: { entity: { id: pay14, order_id: order14, amount: 500000, currency: "INR" } } },
      },
      eventId: `evt_14_${Date.now()}`,
    });
    assert(res14.status === 200, "Webhook returns HTTP 200 when payment already verified");
    const db14 = await PaymentModel.findOne({ razorpayOrderId: order14 });
    assert(
      db14.status === "CAPTURED" || db14.status === "CREDITED",
      "Payment status remains CAPTURED or CREDITED"
    );

    // -------------------------------------------------------------
    // TEST 15: Webhook Received Before Frontend Verification
    // -------------------------------------------------------------
    console.log("\n--- 15. Webhook Received Before Frontend Verification ---");
    const order15 = `order_wh_15_${Date.now()}`;
    const pay15 = `pay_wh_15_${Date.now()}`;
    await seedPayment({ orderId: order15, status: "CREATED", amount: 500000 });

    // Webhook captures it first
    await postWebhook({
      payload: {
        event: "payment.captured",
        payload: { payment: { entity: { id: pay15, order_id: order15, amount: 500000, currency: "INR" } } },
      },
      eventId: `evt_15_${Date.now()}`,
    });

    const db15 = await PaymentModel.findOne({ razorpayOrderId: order15 });
    assert(
      db15.status === "CAPTURED" || db15.status === "CREDITED",
      "Webhook successfully captured payment prior to frontend verification"
    );

    // -------------------------------------------------------------
    // TEST 16: Unknown Internal Payment (Scheduled for Retry)
    // -------------------------------------------------------------
    console.log("\n--- 16. Unknown Internal Payment ---");
    const ghostOrderId = `order_ghost_${Date.now()}`;
    const evt16Id = `evt_ghost_${Date.now()}`;
    const res16 = await postWebhook({
      payload: {
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_ghost", order_id: ghostOrderId, amount: 100000, currency: "INR" } } },
      },
      eventId: evt16Id,
    });
    assert(res16.status === 200, "Unknown payment safely accepted without server crash");
    const dbEvt16 = await WebhookEventModel.findOne({ razorpayEventId: evt16Id });
    assert(
      dbEvt16.processingStatus === "RECEIVED",
      "Event remains in RECEIVED status scheduled for retry"
    );

    // -------------------------------------------------------------
    // TEST 17: Amount Mismatch Rejection
    // -------------------------------------------------------------
    console.log("\n--- 17. Amount Mismatch Rejection ---");
    const order17 = `order_wh_17_${Date.now()}`;
    await seedPayment({ orderId: order17, amount: 500000, status: "CREATED" });

    const evt17Id = `evt_mismatch_amt_${Date.now()}`;
    await postWebhook({
      payload: {
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_17", order_id: order17, amount: 100000, currency: "INR" } } },
      },
      eventId: evt17Id,
    });
    const dbPayment17 = await PaymentModel.findOne({ razorpayOrderId: order17 });
    assert(dbPayment17.status === "CREATED", "Payment NOT captured when webhook amount mismatches");
    const dbEvt17 = await WebhookEventModel.findOne({ razorpayEventId: evt17Id });
    assert(dbEvt17.lastError.includes("mismatch"), "Webhook event records amount mismatch in lastError");

    // -------------------------------------------------------------
    // TEST 18: Currency Mismatch Rejection
    // -------------------------------------------------------------
    console.log("\n--- 18. Currency Mismatch Rejection ---");
    const order18 = `order_wh_18_${Date.now()}`;
    await seedPayment({ orderId: order18, amount: 500000, currency: "INR", status: "CREATED" });

    const evt18Id = `evt_mismatch_curr_${Date.now()}`;
    await postWebhook({
      payload: {
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_18", order_id: order18, amount: 500000, currency: "EUR" } } },
      },
      eventId: evt18Id,
    });
    const dbPayment18 = await PaymentModel.findOne({ razorpayOrderId: order18 });
    assert(dbPayment18.status === "CREATED", "Payment NOT captured when currency mismatches");

    // -------------------------------------------------------------
    // TEST 19: Database Persistence Failure
    // -------------------------------------------------------------
    console.log("\n--- 19. Database Persistence Failure ---");
    const originalCreate = WebhookEventModel.create;
    WebhookEventModel.create = async () => {
      throw new Error("MongoNetworkError: Failed to connect to replica set");
    };

    const res19 = await postWebhook({
      payload: payload1,
      eventId: `evt_db_fail_${Date.now()}`,
    });
    WebhookEventModel.create = originalCreate;

    assert(res19.status === 500, "Database failure returns HTTP 500 without false acknowledgement");

    // -------------------------------------------------------------
    // TEST 20: Event Processing Failure & Bounded Retries
    // -------------------------------------------------------------
    console.log("\n--- 20. Event Processing Failure & Bounded Retries ---");
    const evt20Id = `evt_retry_limit_${Date.now()}`;
    const createdEvt20 = await WebhookEventModel.create({
      razorpayEventId: evt20Id,
      eventType: "payment.captured",
      razorpayOrderId: "order_unresolved_never_exists",
      processingStatus: "RECEIVED",
      retryCount: 5, // Already at max retries
      payload: { amount: 1000 },
    });

    const { processWebhookEventById } = require("../services/webhookService");
    await processWebhookEventById(createdEvt20._id);

    const dbEvt20 = await WebhookEventModel.findById(createdEvt20._id);
    assert(dbEvt20.processingStatus === "FAILED", "Event marked FAILED after exhausting max retries");

    // -------------------------------------------------------------
    // TEST 21: Worker Recovery After Simulated Restart
    // -------------------------------------------------------------
    console.log("\n--- 21. Worker Recovery After Restart ---");
    const order21 = `order_wh_21_${Date.now()}`;
    const pay21 = `pay_wh_21_${Date.now()}`;
    await seedPayment({ orderId: order21, amount: 900000, status: "CREATED" });

    const evt21Id = `evt_recover_${Date.now()}`;
    await WebhookEventModel.create({
      razorpayEventId: evt21Id,
      eventType: "payment.captured",
      razorpayOrderId: order21,
      razorpayPaymentId: pay21,
      processingStatus: "RECEIVED",
      retryCount: 0,
      payload: { amount: 900000, currency: "INR" },
    });

    // Run recovery worker
    const recoveryResults = await recoverStaleWebhookEvents({ maxBatch: 10 });
    const recoveredTarget = recoveryResults.find((r) => r.eventId === evt21Id);
    assert(recoveredTarget !== undefined, "Recovery worker found pending event");

    const dbPayment21 = await PaymentModel.findOne({ razorpayOrderId: order21 });
    assert(
      dbPayment21.status === "CAPTURED" || dbPayment21.status === "CREDITED",
      "Recovery worker successfully captured pending payment"
    );
    const dbEvt21 = await WebhookEventModel.findOne({ razorpayEventId: evt21Id });
    assert(dbEvt21.processingStatus === "PROCESSED", "Recovered event marked PROCESSED");

    // -------------------------------------------------------------
    // TEST 22: Duplicate payment.captured Followed by order.paid
    // -------------------------------------------------------------
    console.log("\n--- 22. payment.captured Followed by order.paid ---");
    const order22 = `order_wh_22_${Date.now()}`;
    const pay22 = `pay_wh_22_${Date.now()}`;
    await seedPayment({ orderId: order22, amount: 800000, status: "CREATED" });

    // Send payment.captured
    await postWebhook({
      payload: {
        event: "payment.captured",
        payload: { payment: { entity: { id: pay22, order_id: order22, amount: 800000, currency: "INR" } } },
      },
      eventId: `evt_22_cap_${Date.now()}`,
    });

    // Send order.paid
    const res22Order = await postWebhook({
      payload: {
        event: "order.paid",
        payload: { order: { entity: { id: order22, amount_paid: 800000, status: "paid" } } },
      },
      eventId: `evt_22_ord_${Date.now()}`,
    });

    assert(res22Order.status === 200, "order.paid after payment.captured succeeds cleanly (HTTP 200)");
    const db22 = await PaymentModel.findOne({ razorpayOrderId: order22 });
    assert(
      db22.status === "CAPTURED" || db22.status === "CREDITED",
      "Payment status remains stable as CAPTURED or CREDITED"
    );

    // -------------------------------------------------------------
    // TEST 23: Refund Event Persistence
    // -------------------------------------------------------------
    console.log("\n--- 23. Refund Event Persistence ---");
    const evtRefundProcessed = `evt_rfnd_proc_${Date.now()}`;
    const resRefundProc = await postWebhook({
      payload: {
        event: "refund.processed",
        payload: {
          refund: {
            entity: {
              id: "rfnd_test_123",
              payment_id: pay22,
              amount: 800000,
              currency: "INR",
              status: "processed",
            },
          },
        },
      },
      eventId: evtRefundProcessed,
    });
    assert(resRefundProc.status === 200, "refund.processed returns HTTP 200");
    const dbEvtRefund = await WebhookEventModel.findOne({ razorpayEventId: evtRefundProcessed });
    assert(dbEvtRefund?.processingStatus === "PROCESSED", "refund.processed recorded and processed");

    const evtRefundFailed = `evt_rfnd_fail_${Date.now()}`;
    const resRefundFail = await postWebhook({
      payload: {
        event: "refund.failed",
        payload: {
          refund: {
            entity: {
              id: "rfnd_fail_456",
              payment_id: pay22,
              status: "failed",
            },
          },
        },
      },
      eventId: evtRefundFailed,
    });
    assert(resRefundFail.status === 200, "refund.failed returns HTTP 200");

    // -------------------------------------------------------------
    // TEST 24: Secret Leakage Prevention
    // -------------------------------------------------------------
    console.log("\n--- 24. Secret Leakage Prevention ---");
    const combinedResponses = JSON.stringify(allResponsePayloads);

    const leaksWhSecret = TEST_WEBHOOK_SECRET && combinedResponses.includes(TEST_WEBHOOK_SECRET);
    const leaksKeySecret = keySecret && combinedResponses.includes(keySecret);
    const leaksMongoUri = mongoUri && combinedResponses.includes(mongoUri);

    assert(!leaksWhSecret, "RAZORPAY_WEBHOOK_SECRET is NEVER leaked in any webhook response");
    assert(!leaksKeySecret, "RAZORPAY_KEY_SECRET is NEVER leaked in responses");
    assert(!leaksMongoUri, "MongoDB URI / credentials are NEVER leaked in responses");

  } catch (err) {
    console.error("Unexpected test failure:", err);
    failed++;
  } finally {
    // Clean up test data
    console.log("\n--> Cleaning up webhook test documents...");
    await WebhookEventModel.deleteMany({ razorpayEventId: /^evt_/ });
    await PaymentModel.deleteMany({ razorpayOrderId: /^order_wh_/ });

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

runWebhookTestSuite();
