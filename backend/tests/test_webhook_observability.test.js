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
const { FundsModel } = require("../model/FundsModel");
const { WebhookEventModel } = require("../model/WebhookEventModel");
const webhookRoutes = require("../routes/webhookRoutes");
const { setLogListener, clearLogListener } = require("../util/webhookLogger");
const { getRazorpayCredentials } = require("../config/razorpay");

async function runWebhookObservabilityTestSuite() {
  console.log("================================================================");
  console.log("      RAZORPAY WEBHOOK OBSERVABILITY & AUDIT TEST SUITE         ");
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
  console.log("--> Connected to MongoDB Atlas for Observability Tests\n");

  // 2. Setup Test Express Server matching production routing
  const app = express();
  app.use(cookieParser());
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
  app.use(bodyParser.json());

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const webhookUrl = `http://localhost:${port}/api/webhooks/razorpay`;

  const TEST_SECRET = "whsec_test_observability_secret_987654";
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET;

  const capturedLogs = [];
  setLogListener((entry, line) => {
    capturedLogs.push({ entry, line });
  });

  const postWebhook = async ({
    payload,
    eventId = `evt_obs_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    signatureOverride = null,
    secret = TEST_SECRET,
    omitSignature = false,
  }) => {
    const rawBody = typeof payload === "string" ? payload : JSON.stringify(payload);
    let signature = signatureOverride;
    if (!signature && !omitSignature) {
      signature = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");
    }

    const headers = { "Content-Type": "application/json" };
    if (!omitSignature && signature) headers["x-razorpay-signature"] = signature;
    if (eventId) headers["x-razorpay-event-id"] = eventId;

    try {
      const res = await axios.post(webhookUrl, rawBody, { headers });
      return res;
    } catch (err) {
      return err.response;
    }
  };

  try {
    const testUserId = `user_obs_${Date.now()}`;
    await FundsModel.create({
      userId: testUserId,
      availableCash: 5000,
      availableMargin: 5000,
      usedMargin: 0,
      payin: 5000,
    });

    // -------------------------------------------------------------
    // 1. Successful payment.captured Webhook Observability
    // -------------------------------------------------------------
    console.log("--- 1. payment.captured Webhook: Render Logs + MongoDB Audit ---");
    const order1Id = `order_obs_1_${Date.now()}`;
    const pay1Id = `pay_obs_1_${Date.now()}`;
    const evt1Id = `evt_obs_captured_${Date.now()}`;

    await PaymentModel.create({
      userId: testUserId,
      internalPaymentId: `PAY_OBS_1_${Date.now()}`,
      razorpayOrderId: order1Id,
      razorpayPaymentId: pay1Id,
      amount: 250000, // ₹2,500
      status: "CREATED",
    });

    const payload1 = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: pay1Id,
            order_id: order1Id,
            amount: 250000,
            currency: "INR",
            status: "captured",
            method: "upi",
          },
        },
      },
    };

    capturedLogs.length = 0;
    const res1 = await postWebhook({ payload: payload1, eventId: evt1Id });
    assert(res1.status === 200, "1. HTTP 200 returned for valid payment.captured");

    // Verify Render Logs emitted
    const incomingLog = capturedLogs.find((l) => l.entry.stage === "incoming_request" && l.entry.eventId === evt1Id);
    assert(incomingLog !== undefined, "1. Render Log: incoming_request stage recorded");
    assert(incomingLog.line.startsWith("[RazorpayWebhook]"), "1. Render Log: Line has prefix [RazorpayWebhook]");

    const sigLog = capturedLogs.find((l) => l.entry.stage === "signature_verification" && l.entry.level === "info");
    assert(sigLog !== undefined, "1. Render Log: signature_verification success recorded");

    const persistLog = capturedLogs.find((l) => l.entry.stage === "event_persistence" && l.entry.status === "RECEIVED");
    assert(persistLog !== undefined, "1. Render Log: event_persistence with status RECEIVED recorded");

    const creditingLog = capturedLogs.find((l) => l.entry.stage === "wallet_crediting" && l.entry.status === "CREDITED");
    assert(creditingLog !== undefined, "1. Render Log: wallet_crediting with status CREDITED recorded");

    const completedLog = capturedLogs.find((l) => l.entry.stage === "event_completed" && l.entry.status === "PROCESSED");
    assert(completedLog !== undefined, "1. Render Log: event_completed with status PROCESSED recorded");

    // Verify MongoDB WebhookEvent Document
    const dbEvent1 = await WebhookEventModel.findOne({ razorpayEventId: evt1Id });
    assert(dbEvent1 !== null, "1. MongoDB: WebhookEvent record exists");
    assert(dbEvent1.eventType === "payment.captured", "1. MongoDB: eventType matches");
    assert(dbEvent1.signatureVerified === true, "1. MongoDB: signatureVerified is true");
    assert(dbEvent1.processingStatus === "PROCESSED", "1. MongoDB: processingStatus transitioned to PROCESSED");
    assert(dbEvent1.receivedAt instanceof Date, "1. MongoDB: receivedAt populated");
    assert(dbEvent1.processingStartedAt instanceof Date, "1. MongoDB: processingStartedAt populated");
    assert(dbEvent1.processedAt instanceof Date, "1. MongoDB: processedAt populated");
    assert(dbEvent1.isDuplicate === false, "1. MongoDB: isDuplicate is false");
    assert(dbEvent1.lastError === null, "1. MongoDB: lastError is null");

    // -------------------------------------------------------------
    // 2. Duplicate Webhook Delivery Observability
    // -------------------------------------------------------------
    console.log("\n--- 2. Duplicate Webhook Delivery Observability ---");
    capturedLogs.length = 0;
    const resDup = await postWebhook({ payload: payload1, eventId: evt1Id });
    assert(resDup.status === 200, "2. HTTP 200 returned for duplicate webhook");
    assert(resDup.data.isDuplicate === true, "2. Response reflects isDuplicate: true");

    const dupLog = capturedLogs.find((l) => l.entry.stage === "duplicate_detection" && l.entry.level === "warn");
    assert(dupLog !== undefined, "2. Render Log: duplicate_detection warning emitted");

    const dbEventCount = await WebhookEventModel.countDocuments({ razorpayEventId: evt1Id });
    assert(dbEventCount === 1, "2. MongoDB: Zero duplicate documents created in WebhookEvent collection");

    // -------------------------------------------------------------
    // 3. Cryptographic Signature Failure Observability
    // -------------------------------------------------------------
    console.log("\n--- 3. Invalid Signature Observability ---");
    capturedLogs.length = 0;
    const evtBadSig = `evt_obs_bad_sig_${Date.now()}`;
    const resBadSig = await postWebhook({
      payload: payload1,
      eventId: evtBadSig,
      signatureOverride: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    });
    assert(resBadSig.status === 400, "3. HTTP 400 returned for invalid signature");

    const badSigLog = capturedLogs.find(
      (l) => l.entry.stage === "signature_verification" && l.entry.level === "error" && l.entry.errorCode === "INVALID_SIGNATURE"
    );
    assert(badSigLog !== undefined, "3. Render Log: signature_verification error logged with INVALID_SIGNATURE code");

    const dbBadSigDoc = await WebhookEventModel.findOne({ razorpayEventId: evtBadSig });
    assert(dbBadSigDoc === null, "3. MongoDB: Unverified webhook was strictly NOT persisted to database");

    // -------------------------------------------------------------
    // 4. Missing Headers / Malformed Payload Observability
    // -------------------------------------------------------------
    console.log("\n--- 4. Missing Headers / Malformed Payload Observability ---");
    capturedLogs.length = 0;
    const resNoSig = await postWebhook({ payload: payload1, omitSignature: true });
    assert(resNoSig.status === 400, "4. HTTP 400 for missing signature header");
    const missingSigLog = capturedLogs.find(
      (l) => l.entry.stage === "request_validation" && l.entry.errorCode === "MISSING_SIGNATURE"
    );
    assert(missingSigLog !== undefined, "4. Render Log: request_validation error logged with MISSING_SIGNATURE code");

    // -------------------------------------------------------------
    // 5. Refund Webhook Observability
    // -------------------------------------------------------------
    console.log("\n--- 5. Refund Webhook Observability ---");
    const evtRefundId = `evt_obs_rfnd_${Date.now()}`;
    const rzpRefundId = `rfnd_obs_${Date.now()}`;

    const payloadRefund = {
      event: "refund.processed",
      payload: {
        refund: {
          entity: {
            id: rzpRefundId,
            payment_id: pay1Id,
            amount: 100000, // ₹1,000
            status: "processed",
          },
        },
      },
    };

    capturedLogs.length = 0;
    const resRefund = await postWebhook({ payload: payloadRefund, eventId: evtRefundId });
    assert(resRefund.status === 200, "5. HTTP 200 for refund.processed webhook");

    const refundRecvLog = capturedLogs.find((l) => l.entry.stage === "refund_received");
    assert(refundRecvLog !== undefined, "5. Render Log: refund_received stage recorded");

    const refundCorrLog = capturedLogs.find((l) => l.entry.stage === "refund_correlation");
    assert(refundCorrLog !== undefined, "5. Render Log: refund_correlation stage recorded");

    const refundStatusLog = capturedLogs.find((l) => l.entry.stage === "refund_status_update" && l.entry.status === "PROCESSED");
    assert(refundStatusLog !== undefined, "5. Render Log: refund_status_update PROCESSED recorded");

    const dbRefundEvt = await WebhookEventModel.findOne({ razorpayEventId: evtRefundId });
    assert(dbRefundEvt !== null, "5. MongoDB: WebhookEvent record created for refund");
    assert(dbRefundEvt.razorpayRefundId === rzpRefundId, "5. MongoDB: razorpayRefundId stored in WebhookEvent document");

    // -------------------------------------------------------------
    // 6. Processing Error Observability & Database Audit
    // -------------------------------------------------------------
    console.log("\n--- 6. Processing Error Observability ---");
    const evtErrorId = `evt_obs_err_${Date.now()}`;
    const ghostOrderId = `order_obs_ghost_${Date.now()}`;

    const payloadGhost = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_ghost_${Date.now()}`,
            order_id: ghostOrderId,
            amount: 50000,
            currency: "INR",
            status: "captured",
          },
        },
      },
    };

    capturedLogs.length = 0;
    const resGhost = await postWebhook({ payload: payloadGhost, eventId: evtErrorId });
    assert(resGhost.status === 200, "6. Webhook acknowledged (HTTP 200) for retry queue");

    const errorLog = capturedLogs.find(
      (l) => l.entry.stage === "event_processing" && l.entry.level === "error" && l.entry.errorCode === "PROCESSING_ERROR"
    );
    assert(errorLog !== undefined, "6. Render Log: event_processing error logged to console.error");

    const dbErrorEvt = await WebhookEventModel.findOne({ razorpayEventId: evtErrorId });
    assert(dbErrorEvt !== null, "6. MongoDB: WebhookEvent recorded error state");
    assert(dbErrorEvt.processingStatus === "RECEIVED", "6. MongoDB: Processing status is RECEIVED for retry");
    assert(dbErrorEvt.retryCount === 1, "6. MongoDB: retryCount incremented to 1");
    assert(typeof dbErrorEvt.lastError === "string" && dbErrorEvt.lastError.includes(ghostOrderId), "6. MongoDB: lastError stores descriptive reason");

    // -------------------------------------------------------------
    // 7. Security: Zero Leakage of Secrets or PII in Logs
    // -------------------------------------------------------------
    console.log("\n--- 7. Security: Zero Leakage of Secrets or PII in Logs ---");
    const allCapturedOutput = capturedLogs.map((l) => l.line).join("\n");

    const leaksSecret = allCapturedOutput.includes(TEST_SECRET);
    const leaksCvv = /"cvv"|"card"/i.test(allCapturedOutput);
    const leaksRawHmac = allCapturedOutput.includes("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

    assert(!leaksSecret, "7. Security: Webhook secret is strictly NEVER printed in logs");
    assert(!leaksCvv, "7. Security: Card numbers / CVVs are strictly NEVER printed in logs");
    assert(!leaksRawHmac, "7. Security: Raw signature hex is strictly NEVER printed in logs");

    // Cleanup
    await WebhookEventModel.deleteMany({ razorpayEventId: /^evt_obs_/ });
    await PaymentModel.deleteMany({ userId: testUserId });
    await FundsModel.deleteMany({ userId: testUserId });

    console.log("\n================================================================");
    console.log(`OBSERVABILITY RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("================================================================");

    clearLogListener();
    server.close();
    await mongoose.connection.close();

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    clearLogListener();
    server.close();
    await mongoose.connection.close();
    process.exit(1);
  }
}

runWebhookObservabilityTestSuite();

