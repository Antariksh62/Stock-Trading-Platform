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

const { PaymentModel } = require("../model/PaymentModel");
const { FundsModel } = require("../model/FundsModel");
const { WalletTransactionModel } = require("../model/WalletTransactionModel");
const { WebhookEventModel } = require("../model/WebhookEventModel");
const { RefundModel } = require("../model/RefundModel");

const paymentRoutes = require("../routes/paymentRoutes");
const webhookRoutes = require("../routes/webhookRoutes");
const { getRazorpayCredentials } = require("../config/razorpay");
const {
  initiatePaymentRefund,
  handleRefundWebhookEvent,
  reconcilePendingRefunds,
  getPaymentRefundHistory,
  isTransactionSupported,
  isDefiniteGatewayRejection,
} = require("../services/paymentRefundService");

async function runPaymentRefundTestSuite() {
  console.log("================================================================");
  console.log("       RAZORPAY PAYMENT REFUND INTEGRATION TEST SUITE          ");
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
  console.log("--> Connected to MongoDB for Refund Tests\n");

  // Clean up any leftover test data from prior aborted test runs
  await RefundModel.deleteMany({ userId: { $regex: /^(trader_|alice_|bob_|low_margin_|charlie_|david_|eve_|frank_|grace_|diag_)/ } });
  await PaymentModel.deleteMany({ userId: { $regex: /^(trader_|alice_|bob_|low_margin_|charlie_|david_|eve_|frank_|grace_|diag_)/ } });
  await FundsModel.deleteMany({ userId: { $regex: /^(trader_|alice_|bob_|low_margin_|charlie_|david_|eve_|frank_|grace_|diag_)/ } });
  await WalletTransactionModel.deleteMany({ userId: { $regex: /^(trader_|alice_|bob_|low_margin_|charlie_|david_|eve_|frank_|grace_|diag_)/ } });

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
  const port = 59640;
  await new Promise((resolve) => server.listen(port, resolve));
  const baseUrl = `http://localhost:${port}`;
  console.log(`--> Test Server listening at ${baseUrl}\n`);

  const tokenSecret = process.env.TOKEN_KEY || "default_test_token_secret";
  const userAliceId = `alice_${Date.now()}`;
  const userBobId = `bob_${Date.now()}`;

  const aliceToken = jwt.sign({ id: userAliceId }, tokenSecret);
  const bobToken = jwt.sign({ id: userBobId }, tokenSecret);

  // Initialize funds for Alice and Bob
  await FundsModel.findOneAndUpdate(
    { userId: userAliceId },
    {
      $set: {
        availableCash: 10000,
        availableMargin: 10000,
        usedMargin: 0,
        payin: 10000,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  await FundsModel.findOneAndUpdate(
    { userId: userBobId },
    {
      $set: {
        availableCash: 5000,
        availableMargin: 5000,
        usedMargin: 0,
        payin: 5000,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  try {
    // =========================================================================
    // SCENARIO 1: Full Refund of a Captured/Credited Payment with Safe Wallet Debit
    // =========================================================================
    console.log("--- Scenario 1: Full Refund with Safe Wallet Debit ---");
    const order1Id = `order_rfnd_full_${Date.now()}`;
    const pay1Id = `pay_rfnd_full_${Date.now()}`;
    const internalPay1Id = `PAY_RFND_1_${Date.now()}`;
    const rfnd1Id = `rfnd_mock_1_${Date.now()}`;

    const payment1 = await PaymentModel.create({
      userId: userAliceId,
      internalPaymentId: internalPay1Id,
      razorpayOrderId: order1Id,
      razorpayPaymentId: pay1Id,
      amount: 400000, // ₹4,000
      currency: "INR",
      status: "CREDITED",
      capturedAt: new Date(),
      creditedAt: new Date(),
    });

    const mockClientScenario1 = {
      payments: {
        refund: async (targetPayId, opts) => {
          assert(targetPayId === pay1Id, "Scenario 1: Razorpay called with correct payment ID");
          assert(opts.amount === 400000, "Scenario 1: Refund amount in paise is 400,000 (₹4,000)");
          return {
            id: rfnd1Id,
            entity: "refund",
            amount: 400000,
            currency: "INR",
            payment_id: targetPayId,
            status: "processed",
            speed_processed: "normal",
            notes: opts.notes,
          };
        },
      },
    };

    const outcome1 = await initiatePaymentRefund({
      userId: userAliceId,
      paymentIdentifier: internalPay1Id,
      amount: null, // Full refund
      reason: "Customer cancellation",
      deductFromWallet: true,
      clientOverride: mockClientScenario1,
    });

    assert(outcome1.success === true, "Scenario 1: initiatePaymentRefund returned success: true");
    assert(outcome1.refund.status === "PROCESSED", "Scenario 1: Refund status is PROCESSED");
    assert(outcome1.refund.refundStatus === "FULL", "Scenario 1: Payment refundStatus marked FULL");
    assert(outcome1.refund.walletDeductionStatus === "DEDUCTED", "Scenario 1: walletDeductionStatus is DEDUCTED");

    const updatedPayment1 = await PaymentModel.findOne({ internalPaymentId: internalPay1Id });
    assert(updatedPayment1.amountRefunded === 400000, "Scenario 1: amountRefunded is 400,000 paise");
    assert(updatedPayment1.refundStatus === "FULL", "Scenario 1: DB record refundStatus is FULL");
    assert(updatedPayment1.refunds.length === 1, "Scenario 1: DB record contains 1 refund entry");
    assert(updatedPayment1.refunds[0].razorpayRefundId === rfnd1Id, "Scenario 1: razorpayRefundId stored");

    const aliceFunds1 = await FundsModel.findOne({ userId: userAliceId });
    assert(
      aliceFunds1.availableMargin === 6000, // 10000 - 4000
      `Scenario 1: Alice available margin decremented by ₹4,000 (now: ₹${aliceFunds1.availableMargin})`
    );

    const refundLedger1 = await WalletTransactionModel.findOne({
      userId: userAliceId,
      type: "REFUND",
    });
    assert(refundLedger1 !== null, "Scenario 1: Immutable REFUND transaction created in ledger");
    assert(refundLedger1.amountRupees === 4000, "Scenario 1: Ledger amountRupees is 4000");
    assert(refundLedger1.balanceAfter === 6000, "Scenario 1: Ledger balanceAfter is 6000");

    // =========================================================================
    // SCENARIO 2: Partial Refunds (Multiple Increments up to Full)
    // =========================================================================
    console.log("\n--- Scenario 2: Partial Refunds Accumulation ---");
    const order2Id = `order_rfnd_part_${Date.now()}`;
    const pay2Id = `pay_rfnd_part_${Date.now()}`;
    const internalPay2Id = `PAY_RFND_2_${Date.now()}`;
    const rfnd2aId = `rfnd_mock_2a_${Date.now()}`;
    const rfnd2bId = `rfnd_mock_2b_${Date.now()}`;

    await PaymentModel.create({
      userId: userAliceId,
      internalPaymentId: internalPay2Id,
      razorpayOrderId: order2Id,
      razorpayPaymentId: pay2Id,
      amount: 500000, // ₹5,000 total
      currency: "INR",
      status: "CREDITED",
      capturedAt: new Date(),
    });

    const mockClientScenario2 = {
      payments: {
        refund: async (targetPayId, opts) => {
          return {
            id: opts.amount === 200000 ? rfnd2aId : rfnd2bId,
            entity: "refund",
            amount: opts.amount,
            currency: "INR",
            payment_id: targetPayId,
            status: "processed",
          };
        },
      },
    };

    // First partial refund: ₹2,000 (200,000 paise)
    const outcome2a = await initiatePaymentRefund({
      userId: userAliceId,
      paymentIdentifier: pay2Id,
      amount: 200000,
      reason: "Partial refund phase 1",
      deductFromWallet: false, // Pure tracking mode
      clientOverride: mockClientScenario2,
    });

    assert(outcome2a.success === true, "Scenario 2a: First partial refund succeeded");
    assert(outcome2a.refund.refundStatus === "PARTIAL", "Scenario 2a: refundStatus is PARTIAL");
    assert(outcome2a.refund.amountPaise === 200000, "Scenario 2a: amountPaise is 200,000");
    assert(outcome2a.refund.walletDeductionStatus === "UNTOUCHED", "Scenario 2a: wallet was UNTOUCHED");

    // Second partial refund: remaining ₹3,000 (300,000 paise)
    const outcome2b = await initiatePaymentRefund({
      userId: userAliceId,
      paymentIdentifier: pay2Id,
      amount: 300000,
      reason: "Partial refund phase 2",
      deductFromWallet: false,
      clientOverride: mockClientScenario2,
    });

    assert(outcome2b.success === true, "Scenario 2b: Second partial refund succeeded");
    assert(outcome2b.refund.refundStatus === "FULL", "Scenario 2b: refundStatus transitioned to FULL");

    const updatedPayment2 = await PaymentModel.findOne({ internalPaymentId: internalPay2Id });
    assert(updatedPayment2.amountRefunded === 500000, "Scenario 2: Total amountRefunded equals 500,000 paise");
    assert(updatedPayment2.refunds.length === 2, "Scenario 2: Two auditable refund entries preserved");

    // =========================================================================
    // SCENARIO 3: Exceeding Remaining Refundable Amount Rejection
    // =========================================================================
    console.log("\n--- Scenario 3: Exceeding Refundable Balance Rejection ---");
    const order3Id = `order_rfnd_exceed_${Date.now()}`;
    const pay3Id = `pay_rfnd_exceed_${Date.now()}`;
    const internalPay3Id = `PAY_RFND_3_${Date.now()}`;

    await PaymentModel.create({
      userId: userAliceId,
      internalPaymentId: internalPay3Id,
      razorpayOrderId: order3Id,
      razorpayPaymentId: pay3Id,
      amount: 200000, // ₹2,000
      amountRefunded: 150000, // ₹1,500 already refunded
      refundStatus: "PARTIAL",
      status: "CREDITED",
    });

    let exceededError = null;
    try {
      await initiatePaymentRefund({
        userId: userAliceId,
        paymentIdentifier: internalPay3Id,
        amount: 60000, // Requests ₹600 when only ₹500 remains!
        clientOverride: mockClientScenario2,
      });
    } catch (e) {
      exceededError = e;
    }

    assert(exceededError !== null, "Scenario 3: Exceeding remaining refundable amount rejected");
    assert(exceededError.statusCode === 400, "Scenario 3: Rejection has HTTP 400");
    assert(exceededError.message.includes("exceeds remaining refundable amount"), "Scenario 3: Clear limit error message");

    // =========================================================================
    // SCENARIO 4: Duplicate Refund Requests (Idempotency Protection)
    // =========================================================================
    console.log("\n--- Scenario 4: Duplicate Refund Idempotency ---");
    const idempotencyKey4 = `idem_rfnd_${Date.now()}`;
    let razorpayCallCount4 = 0;

    const mockClientScenario4 = {
      payments: {
        refund: async (targetPayId, opts) => {
          razorpayCallCount4++;
          return {
            id: `rfnd_idem_${Date.now()}`,
            entity: "refund",
            amount: opts.amount,
            status: "processed",
          };
        },
      },
    };

    const order4Id = `order_rfnd_idem_${Date.now()}`;
    const pay4Id = `pay_rfnd_idem_${Date.now()}`;
    const internalPay4Id = `PAY_RFND_4_${Date.now()}`;

    await PaymentModel.create({
      userId: userAliceId,
      internalPaymentId: internalPay4Id,
      razorpayOrderId: order4Id,
      razorpayPaymentId: pay4Id,
      amount: 200000,
      status: "CREDITED",
    });

    // Call 1 with idempotency key
    const call1 = await initiatePaymentRefund({
      userId: userAliceId,
      paymentIdentifier: internalPay4Id,
      amount: 100000,
      idempotencyKey: idempotencyKey4,
      clientOverride: mockClientScenario4,
    });

    assert(call1.success === true, "Scenario 4: First idempotent request succeeded");
    assert(call1.isDuplicate === false, "Scenario 4: First request isDuplicate: false");

    // Call 2 with identical idempotency key
    const call2 = await initiatePaymentRefund({
      userId: userAliceId,
      paymentIdentifier: internalPay4Id,
      amount: 100000,
      idempotencyKey: idempotencyKey4,
      clientOverride: mockClientScenario4,
    });

    assert(call2.success === true, "Scenario 4: Second idempotent request succeeded");
    assert(call2.isDuplicate === true, "Scenario 4: Second request flagged isDuplicate: true");
    assert(
      call1.refund.refundId === call2.refund.refundId,
      "Scenario 4: Identical refundId returned across idempotent calls"
    );
    assert(
      razorpayCallCount4 === 1,
      "Scenario 4: Gateway API called exactly once (Zero duplicate calls to Razorpay)"
    );

    // =========================================================================
    // SCENARIO 5: Already Fully Refunded Payment Rejection
    // =========================================================================
    console.log("\n--- Scenario 5: Already Fully Refunded Rejection ---");
    let fullRefundError = null;
    try {
      await initiatePaymentRefund({
        userId: userAliceId,
        paymentIdentifier: internalPay1Id, // Fully refunded in Scenario 1
        amount: 10000,
        clientOverride: mockClientScenario1,
      });
    } catch (e) {
      fullRefundError = e;
    }

    assert(fullRefundError !== null, "Scenario 5: Attempting to refund a fully refunded payment throws error");
    assert(fullRefundError.statusCode === 400, "Scenario 5: Throws HTTP 400");
    assert(fullRefundError.message.includes("fully refunded"), "Scenario 5: Clear fully refunded explanation");

    // =========================================================================
    // SCENARIO 6: Authorization & Cross-User Security Check
    // =========================================================================
    console.log("\n--- Scenario 6: Authorization & Cross-User Ownership ---");
    // Bob attempts to refund Alice's payment (internalPay4Id)
    let unauthorizedError = null;
    try {
      await initiatePaymentRefund({
        userId: userBobId, // Bob
        paymentIdentifier: internalPay4Id, // Alice's payment
        amount: 50000,
        clientOverride: mockClientScenario4,
      });
    } catch (e) {
      unauthorizedError = e;
    }

    assert(unauthorizedError !== null, "Scenario 6: Cross-user refund attempt rejected");
    assert(unauthorizedError.statusCode === 403, "Scenario 6: Returns HTTP 403 Forbidden");
    assert(unauthorizedError.message.includes("Access denied"), "Scenario 6: Access denied message returned");

    // Via HTTP Endpoint without token
    try {
      await axios.post(`${baseUrl}/api/payments/refund`, {
        payment_id: internalPay4Id,
        amount: 50000,
      });
      assert(false, "Scenario 6: HTTP request without token should fail");
    } catch (httpErr) {
      assert(
        httpErr.response?.status === 401,
        "Scenario 6: HTTP request without token rejected with HTTP 401 Unauthorized"
      );
    }

    // Via HTTP Endpoint with Bob's token targeting Alice's payment
    try {
      await axios.post(
        `${baseUrl}/api/payments/refund`,
        { payment_id: internalPay4Id, amount: 50000 },
        { headers: { Authorization: `Bearer ${bobToken}` } }
      );
      assert(false, "Scenario 6: Cross-user HTTP refund request should fail");
    } catch (httpErr) {
      assert(
        httpErr.response?.status === 403,
        "Scenario 6: Cross-user HTTP refund rejected with HTTP 403 Forbidden"
      );
    }

    // =========================================================================
    // SCENARIO 7: Safe Wallet Accounting - Insufficient Funds / Deficit Avoidance
    // =========================================================================
    console.log("\n--- Scenario 7: Insufficient Funds Deficit Avoidance ---");
    const order7Id = `order_rfnd_deficit_${Date.now()}`;
    const pay7Id = `pay_rfnd_deficit_${Date.now()}`;
    const internalPay7Id = `PAY_RFND_7_${Date.now()}`;

    // Create user with low available margin (e.g. ₹500 because ₹9,500 is in active stock positions)
    const userLowMarginId = `trader_tied_margin_${Date.now()}`;
    await FundsModel.create({
      userId: userLowMarginId,
      availableCash: 500,
      availableMargin: 500,
      usedMargin: 9500, // Funds tied up in stock holdings!
      payin: 10000,
    });

    await PaymentModel.create({
      userId: userLowMarginId,
      internalPaymentId: internalPay7Id,
      razorpayOrderId: order7Id,
      razorpayPaymentId: pay7Id,
      amount: 500000, // Original deposit was ₹5,000
      currency: "INR",
      status: "CREDITED",
      capturedAt: new Date(),
    });

    const mockClientScenario7 = {
      payments: {
        refund: async (targetPayId, opts) => ({
          id: `rfnd_def_${Date.now()}`,
          entity: "refund",
          amount: opts.amount,
          status: "processed",
        }),
      },
    };

    // Attempt refund of ₹3,000 with deductFromWallet: true
    const outcome7 = await initiatePaymentRefund({
      userId: userLowMarginId,
      paymentIdentifier: internalPay7Id,
      amount: 300000, // ₹3,000
      deductFromWallet: true,
      clientOverride: mockClientScenario7,
    });

    assert(outcome7.success === true, "Scenario 7: Gateway refund succeeded");
    assert(
      outcome7.refund.walletDeductionStatus === "INSUFFICIENT_FUNDS",
      "Scenario 7: walletDeductionStatus marked INSUFFICIENT_FUNDS"
    );

    const lowFundsAfter = await FundsModel.findOne({ userId: userLowMarginId });
    assert(
      lowFundsAfter.availableMargin === 500,
      "Scenario 7: Wallet available margin was NOT pushed negative (remains ₹500)"
    );
    assert(
      lowFundsAfter.availableCash >= 0,
      "Scenario 7: Wallet available cash strictly non-negative"
    );

    // =========================================================================
    // SCENARIO 8: Attempting to Refund Uncaptured / Failed / Created Payment
    // =========================================================================
    console.log("\n--- Scenario 8: Uncaptured Payment Refund Rejection ---");
    const order8Id = `order_rfnd_uncap_${Date.now()}`;
    const internalPay8Id = `PAY_RFND_8_${Date.now()}`;

    await PaymentModel.create({
      userId: userAliceId,
      internalPaymentId: internalPay8Id,
      razorpayOrderId: order8Id,
      amount: 200000,
      status: "CREATED", // Not captured or credited
    });

    let uncapturedError = null;
    try {
      await initiatePaymentRefund({
        userId: userAliceId,
        paymentIdentifier: internalPay8Id,
        clientOverride: mockClientScenario1,
      });
    } catch (e) {
      uncapturedError = e;
    }

    assert(uncapturedError !== null, "Scenario 8: Refund of CREATED payment rejected");
    assert(uncapturedError.statusCode === 400, "Scenario 8: Returns HTTP 400");
    assert(uncapturedError.message.includes("Cannot refund payment in 'CREATED' status"), "Scenario 8: Clear status error message");

    // =========================================================================
    // SCENARIO 9: Gateway API Failure Handling (502 / Error)
    // =========================================================================
    console.log("\n--- Scenario 9: Gateway API Failure Handling ---");
    const order9Id = `order_rfnd_err_${Date.now()}`;
    const pay9Id = `pay_rfnd_err_${Date.now()}`;
    const internalPay9Id = `PAY_RFND_9_${Date.now()}`;

    await PaymentModel.create({
      userId: userAliceId,
      internalPaymentId: internalPay9Id,
      razorpayOrderId: order9Id,
      razorpayPaymentId: pay9Id,
      amount: 300000,
      status: "CREDITED",
    });

    const mockFailingClient = {
      payments: {
        refund: async () => {
          const apiErr = new Error("Gateway service unavailable (HTTP 502)");
          apiErr.statusCode = 502;
          throw apiErr;
        },
      },
    };

    let gatewayErr = null;
    try {
      await initiatePaymentRefund({
        userId: userAliceId,
        paymentIdentifier: internalPay9Id,
        clientOverride: mockFailingClient,
      });
    } catch (e) {
      gatewayErr = e;
    }

    assert(gatewayErr !== null, "Scenario 9: Gateway failure throws error");
    assert(gatewayErr.statusCode === 502, "Scenario 9: Propagates HTTP 502");

    const payment9After = await PaymentModel.findOne({ internalPaymentId: internalPay9Id });
    assert(payment9After.amountRefunded === 0, "Scenario 9: amountRefunded remains 0 on gateway failure");
    assert(payment9After.refundStatus === "NONE", "Scenario 9: refundStatus remains NONE");

    // =========================================================================
    // SCENARIO 10: Webhook Idempotency for refund.processed and refund.failed
    // =========================================================================
    console.log("\n--- Scenario 10: Webhook Idempotency (refund.processed & refund.failed) ---");
    const order10Id = `order_rfnd_wh_${Date.now()}`;
    const pay10Id = `pay_rfnd_wh_${Date.now()}`;
    const internalPay10Id = `PAY_RFND_10_${Date.now()}`;
    const rfnd10Id = `rfnd_wh_10_${Date.now()}`;

    await PaymentModel.create({
      userId: userAliceId,
      internalPaymentId: internalPay10Id,
      razorpayOrderId: order10Id,
      razorpayPaymentId: pay10Id,
      amount: 400000,
      status: "CREDITED",
    });

    // 10A. First delivery of refund.processed
    const whResult1 = await handleRefundWebhookEvent({
      eventType: "refund.processed",
      refundEntity: {
        id: rfnd10Id,
        payment_id: pay10Id,
        amount: 200000, // ₹2,000
        currency: "INR",
        status: "processed",
      },
    });

    assert(whResult1.success === true, "Scenario 10a: First refund.processed webhook succeeded");
    assert(whResult1.isDuplicate === false, "Scenario 10a: isDuplicate is false");

    const payment10AfterWh = await PaymentModel.findOne({ internalPaymentId: internalPay10Id });
    assert(payment10AfterWh.amountRefunded === 200000, "Scenario 10a: amountRefunded updated to 200,000");
    assert(payment10AfterWh.refundStatus === "PARTIAL", "Scenario 10a: refundStatus is PARTIAL");

    // 10B. Duplicate delivery of refund.processed
    const whResult2 = await handleRefundWebhookEvent({
      eventType: "refund.processed",
      refundEntity: {
        id: rfnd10Id,
        payment_id: pay10Id,
        amount: 200000,
        currency: "INR",
        status: "processed",
      },
    });

    assert(whResult2.success === true, "Scenario 10b: Duplicate webhook delivery handled");
    assert(whResult2.isDuplicate === true, "Scenario 10b: Flagged as duplicate");

    const payment10AfterDup = await PaymentModel.findOne({ internalPaymentId: internalPay10Id });
    assert(
      payment10AfterDup.amountRefunded === 200000,
      "Scenario 10b: amountRefunded strictly NOT doubled on duplicate webhook delivery"
    );

    // 10C. refund.failed webhook
    const whResult3 = await handleRefundWebhookEvent({
      eventType: "refund.failed",
      refundEntity: {
        id: rfnd10Id,
        payment_id: pay10Id,
        amount: 200000,
        error_description: "Bank rejected refund credit.",
      },
    });

    assert(whResult3.success === true, "Scenario 10c: refund.failed webhook handled");
    const payment10AfterFail = await PaymentModel.findOne({ internalPaymentId: internalPay10Id });
    assert(
      payment10AfterFail.refunds[0].status === "FAILED",
      "Scenario 10c: Refund status transitioned to FAILED"
    );
    assert(
      payment10AfterFail.amountRefunded === 0,
      "Scenario 10c: amountRefunded backed out on failed refund webhook"
    );

    // =========================================================================
    // SCENARIO 11: Auditable Refund History Query & Ledger Immutability
    // =========================================================================
    console.log("\n--- Scenario 11: Refund History & Ledger Immutability ---");
    const historyAlice = await getPaymentRefundHistory({
      userId: userAliceId,
      paymentIdentifier: internalPay1Id,
    });

    assert(historyAlice.success === true, "Scenario 11: getPaymentRefundHistory returns success: true");
    assert(historyAlice.payment.refundStatus === "FULL", "Scenario 11: History shows FULL refund status");
    assert(historyAlice.payment.refunds.length === 1, "Scenario 11: History shows 1 refund event");
    assert(
      historyAlice.payment.refunds[0].razorpayRefundId === rfnd1Id,
      "Scenario 11: Stored refund ID matches in audit history"
    );

    // Via HTTP GET endpoint
    const httpHistoryResp = await axios.get(
      `${baseUrl}/api/payments/refunds/${internalPay1Id}`,
      { headers: { Authorization: `Bearer ${aliceToken}` } }
    );
    assert(httpHistoryResp.status === 200, "Scenario 11: HTTP GET /api/payments/refunds/:id returns 200");
    assert(
      httpHistoryResp.data.payment.amountRefundedRupees === 4000,
      "Scenario 11: HTTP response echoes amountRefundedRupees: ₹4,000"
    );

    // =========================================================================
    // SCENARIO 12: Malformed Webhook Amounts Validation & Quarantine
    // =========================================================================
    console.log("\n--- Scenario 12: Malformed Webhook Amounts Validation & Quarantine ---");
    const order12Id = `order_rfnd_malformed_${Date.now()}`;
    const pay12Id = `pay_rfnd_malformed_${Date.now()}`;
    const internalPay12Id = `PAY_RFND_12_${Date.now()}`;

    await PaymentModel.create({
      userId: userAliceId,
      internalPaymentId: internalPay12Id,
      razorpayOrderId: order12Id,
      razorpayPaymentId: pay12Id,
      amount: 500000, // ₹5,000
      status: "CREDITED",
    });

    // 12A. Missing amount (undefined)
    const malformedMissing = await handleRefundWebhookEvent({
      eventType: "refund.processed",
      refundEntity: {
        id: `rfnd_mal_1_${Date.now()}`,
        payment_id: pay12Id,
        currency: "INR",
        status: "processed",
      },
    });
    assert(malformedMissing.success === false, "Scenario 12a: Missing amount webhook rejected");
    assert(malformedMissing.quarantined === true, "Scenario 12a: Missing amount webhook quarantined");

    // 12B. Null amount
    const malformedNull = await handleRefundWebhookEvent({
      eventType: "refund.processed",
      refundEntity: {
        id: `rfnd_mal_2_${Date.now()}`,
        payment_id: pay12Id,
        amount: null,
        status: "processed",
      },
    });
    assert(malformedNull.success === false, "Scenario 12b: Null amount rejected");
    assert(malformedNull.quarantined === true, "Scenario 12b: Null amount quarantined");

    // 12C. Zero amount
    const malformedZero = await handleRefundWebhookEvent({
      eventType: "refund.processed",
      refundEntity: {
        id: `rfnd_mal_3_${Date.now()}`,
        payment_id: pay12Id,
        amount: 0,
        status: "processed",
      },
    });
    assert(malformedZero.success === false, "Scenario 12c: Zero amount rejected");

    // 12D. Negative amount
    const malformedNeg = await handleRefundWebhookEvent({
      eventType: "refund.processed",
      refundEntity: {
        id: `rfnd_mal_4_${Date.now()}`,
        payment_id: pay12Id,
        amount: -500,
        status: "processed",
      },
    });
    assert(malformedNeg.success === false, "Scenario 12d: Negative amount rejected");

    // 12E. Decimal amount
    const malformedDec = await handleRefundWebhookEvent({
      eventType: "refund.processed",
      refundEntity: {
        id: `rfnd_mal_5_${Date.now()}`,
        payment_id: pay12Id,
        amount: 100.5,
        status: "processed",
      },
    });
    assert(malformedDec.success === false, "Scenario 12e: Decimal amount rejected");

    // 12F. Non-numeric amount
    const malformedStr = await handleRefundWebhookEvent({
      eventType: "refund.processed",
      refundEntity: {
        id: `rfnd_mal_6_${Date.now()}`,
        payment_id: pay12Id,
        amount: "invalid_paise",
        status: "processed",
      },
    });
    assert(malformedStr.success === false, "Scenario 12f: Non-numeric amount rejected");

    // Verify payment was NEVER mutated by any malformed amount (no 100 paise invented!)
    const payment12Unchanged = await PaymentModel.findOne({ internalPaymentId: internalPay12Id });
    assert(payment12Unchanged.amountRefunded === 0, "Scenario 12: amountRefunded remains strictly 0 (no invented 100 paise)");
    assert(payment12Unchanged.refundStatus === "NONE", "Scenario 12: refundStatus remains strictly NONE");
    assert(payment12Unchanged.refunds.length === 0, "Scenario 12: zero refunds inserted into payment document");

    // 12G. Authoritative resolution of missing webhook amount from pre-existing refund record
    const knownRefundId = `rfnd_known_${Date.now()}`;
    await RefundModel.create({
      refundId: `RFND_KNOWN_${Date.now()}`,
      paymentId: internalPay12Id,
      internalPaymentId: internalPay12Id,
      razorpayPaymentId: pay12Id,
      razorpayRefundId: knownRefundId,
      userId: userAliceId,
      amount: 150000, // ₹1,500
      amountRupees: 1500,
      status: "PENDING",
    });

    const recoveredWebhook = await handleRefundWebhookEvent({
      eventType: "refund.processed",
      refundEntity: {
        id: knownRefundId,
        payment_id: pay12Id,
        amount: null, // missing in webhook!
        status: "processed",
      },
    });
    assert(recoveredWebhook.success === true, "Scenario 12g: Webhook with missing amount resolved authoritatively from existing record");
    const payment12Recovered = await PaymentModel.findOne({ internalPaymentId: internalPay12Id });
    assert(payment12Recovered.amountRefunded === 150000, "Scenario 12g: amountRefunded updated to authoritative ₹1,500");

    // =========================================================================
    // SCENARIO 13: Multi-Instance Database-Level Compound Unique Idempotency
    // =========================================================================
    console.log("\n--- Scenario 13: Multi-Instance DB Unique Compound Idempotency ---");
    const order13AId = `order_rfnd_idem_a_${Date.now()}`;
    const pay13AId = `pay_rfnd_idem_a_${Date.now()}`;
    const internalPay13AId = `PAY_RFND_13A_${Date.now()}`;

    const order13BId = `order_rfnd_idem_b_${Date.now()}`;
    const pay13BId = `pay_rfnd_idem_b_${Date.now()}`;
    const internalPay13BId = `PAY_RFND_13B_${Date.now()}`;

    await PaymentModel.create({
      userId: userAliceId,
      internalPaymentId: internalPay13AId,
      razorpayOrderId: order13AId,
      razorpayPaymentId: pay13AId,
      amount: 500000,
      status: "CREDITED",
    });

    await PaymentModel.create({
      userId: userAliceId,
      internalPaymentId: internalPay13BId,
      razorpayOrderId: order13BId,
      razorpayPaymentId: pay13BId,
      amount: 500000,
      status: "CREDITED",
    });

    const sharedIdempotencyKey = `idem_key_shared_${Date.now()}`;
    const mockClient13 = {
      payments: {
        refund: async (targetPayId, opts) => ({
          id: `rfnd_13_${Date.now()}`,
          entity: "refund",
          amount: opts.amount,
          payment_id: targetPayId,
          status: "processed",
        }),
      },
    };

    // First refund on Payment A with sharedIdempotencyKey
    const res13A1 = await initiatePaymentRefund({
      userId: userAliceId,
      paymentIdentifier: internalPay13AId,
      amount: 100000,
      idempotencyKey: sharedIdempotencyKey,
      clientOverride: mockClient13,
    });
    assert(res13A1.success === true, "Scenario 13: First refund with key succeeded");
    assert(res13A1.isDuplicate === false, "Scenario 13: First refund isDuplicate: false");

    // Second refund on Payment A with same sharedIdempotencyKey (Duplicate request)
    const res13A2 = await initiatePaymentRefund({
      userId: userAliceId,
      paymentIdentifier: internalPay13AId,
      amount: 100000,
      idempotencyKey: sharedIdempotencyKey,
      clientOverride: mockClient13,
    });
    assert(res13A2.success === true, "Scenario 13: Duplicate refund with key returned success");
    assert(res13A2.isDuplicate === true, "Scenario 13: Duplicate refund flagged isDuplicate: true");
    assert(res13A2.refund.refundId === res13A1.refund.refundId, "Scenario 13: Identical refundId returned");

    // Third refund on DIFFERENT Payment B using the SAME sharedIdempotencyKey
    // Must succeed without duplicate-key collision because index is compound { paymentId, idempotencyKey }
    const res13B = await initiatePaymentRefund({
      userId: userAliceId,
      paymentIdentifier: internalPay13BId,
      amount: 100000,
      idempotencyKey: sharedIdempotencyKey,
      clientOverride: mockClient13,
    });
    assert(res13B.success === true, "Scenario 13: Same idempotency key on DIFFERENT payment succeeded");
    assert(res13B.isDuplicate === false, "Scenario 13: Different payment refund isDuplicate: false");

    // =========================================================================
    // SCENARIO 14: Concurrent Atomic Wallet Deductions with {$gte}
    // =========================================================================
    console.log("\n--- Scenario 14: Concurrent Atomic Wallet Deductions with {$gte} ---");
    const userCharlieId = `charlie_concurrent_${Date.now()}`;
    await FundsModel.create({
      userId: userCharlieId,
      availableCash: 1000, // ₹1,000 available
      availableMargin: 1000,
      usedMargin: 0,
      payin: 1000,
    });

    const order14AId = `order_rfnd_14a_${Date.now()}`;
    const pay14AId = `pay_rfnd_14a_${Date.now()}`;
    const internalPay14AId = `PAY_RFND_14A_${Date.now()}`;

    const order14BId = `order_rfnd_14b_${Date.now()}`;
    const pay14BId = `pay_rfnd_14b_${Date.now()}`;
    const internalPay14BId = `PAY_RFND_14B_${Date.now()}`;

    await PaymentModel.create({
      userId: userCharlieId,
      internalPaymentId: internalPay14AId,
      razorpayOrderId: order14AId,
      razorpayPaymentId: pay14AId,
      amount: 80000, // ₹800
      status: "CREDITED",
    });

    await PaymentModel.create({
      userId: userCharlieId,
      internalPaymentId: internalPay14BId,
      razorpayOrderId: order14BId,
      razorpayPaymentId: pay14BId,
      amount: 80000, // ₹800
      status: "CREDITED",
    });

    const mockClient14 = {
      payments: {
        refund: async (targetPayId, opts) => ({
          id: `rfnd_14_${Date.now()}_${Math.random()}`,
          entity: "refund",
          amount: opts.amount,
          payment_id: targetPayId,
          status: "processed",
        }),
      },
    };

    // Both attempt to deduct ₹800 concurrently when only ₹1,000 exists
    const [res14A, res14B] = await Promise.all([
      initiatePaymentRefund({
        userId: userCharlieId,
        paymentIdentifier: internalPay14AId,
        amount: 80000,
        deductFromWallet: true,
        clientOverride: mockClient14,
      }),
      initiatePaymentRefund({
        userId: userCharlieId,
        paymentIdentifier: internalPay14BId,
        amount: 80000,
        deductFromWallet: true,
        clientOverride: mockClient14,
      }),
    ]);

    const charlieFundsAfter = await FundsModel.findOne({ userId: userCharlieId });
    assert(charlieFundsAfter.availableMargin >= 0, "Scenario 14: Available margin is strictly non-negative (>= ₹0)");
    assert(charlieFundsAfter.availableCash >= 0, "Scenario 14: Available cash is strictly non-negative (>= ₹0)");
    assert(charlieFundsAfter.availableMargin === 200, "Scenario 14: Available margin decremented by exactly one ₹800 deduction (now: ₹200)");

    // Exactly one must be DEDUCTED and one must be INSUFFICIENT_FUNDS
    const statuses = [res14A.walletReversal.status, res14B.walletReversal.status].sort();
    assert(statuses[0] === "DEDUCTED" && statuses[1] === "INSUFFICIENT_FUNDS", "Scenario 14: Exactly one deduction succeeded and one was prevented from creating a deficit");

    // =========================================================================
    // SCENARIO 15: Durable PENDING Refund Recovery via Reconciliation
    // =========================================================================
    console.log("\n--- Scenario 15: Durable PENDING Refund Recovery ---");
    const order15Id = `order_rfnd_rec_${Date.now()}`;
    const pay15Id = `pay_rfnd_rec_${Date.now()}`;
    const internalPay15Id = `PAY_RFND_15_${Date.now()}`;
    const internalRfnd15Id = `RFND_STALE_${Date.now()}`;
    const rzpRfnd15Id = `rfnd_gateway_15_${Date.now()}`;

    await PaymentModel.create({
      userId: userAliceId,
      internalPaymentId: internalPay15Id,
      razorpayOrderId: order15Id,
      razorpayPaymentId: pay15Id,
      amount: 300000,
      status: "CREDITED",
    });

    // Create a stale PENDING refund in RefundModel simulated as a server crash right after gateway call
    await RefundModel.create({
      refundId: internalRfnd15Id,
      paymentId: internalPay15Id,
      internalPaymentId: internalPay15Id,
      razorpayPaymentId: pay15Id,
      razorpayRefundId: rzpRfnd15Id,
      userId: userAliceId,
      amount: 300000,
      amountRupees: 3000,
      status: "PENDING",
      createdAt: new Date(Date.now() - 120000), // 2 minutes ago
    });

    const mockClient15 = {
      refunds: {
        fetch: async (id) => {
          assert(id === rzpRfnd15Id, "Scenario 15: Reconciled correct refund ID");
          return {
            id: rzpRfnd15Id,
            status: "processed",
            amount: 300000,
          };
        },
      },
    };

    const recResult = await reconcilePendingRefunds({
      staleThresholdMs: 60000,
      clientOverride: mockClient15,
    });

    assert(recResult.reconciled >= 1, "Scenario 15: Stale pending refund reconciled successfully");
    const reconciledRefundDoc = await RefundModel.findOne({ refundId: internalRfnd15Id });
    assert(reconciledRefundDoc.status === "PROCESSED", "Scenario 15: Refund status updated to PROCESSED in DB");
    const payment15After = await PaymentModel.findOne({ internalPaymentId: internalPay15Id });
    assert(payment15After.amountRefunded === 300000, "Scenario 15: Payment amountRefunded updated via refund reconciliation");
    assert(payment15After.refundStatus === "FULL", "Scenario 15: Payment refundStatus updated to FULL");

    // =========================================================================
    // SCENARIO 16: Explicit Wallet & Refund Policy Reporting
    // =========================================================================
    console.log("\n--- Scenario 16: Explicit Wallet & Refund Policy Reporting ---");
    const order16Id = `order_rfnd_policy_${Date.now()}`;
    const pay16Id = `pay_rfnd_policy_${Date.now()}`;
    const internalPay16Id = `PAY_RFND_16_${Date.now()}`;

    await PaymentModel.create({
      userId: userAliceId,
      internalPaymentId: internalPay16Id,
      razorpayOrderId: order16Id,
      razorpayPaymentId: pay16Id,
      amount: 200000,
      status: "CREDITED",
    });

    const mockClient16 = {
      payments: {
        refund: async (targetPayId, opts) => ({
          id: `rfnd_16_${Date.now()}`,
          entity: "refund",
          amount: opts.amount,
          payment_id: targetPayId,
          status: "processed",
        }),
      },
    };

    // When deductFromWallet is false:
    const policyResultUntouched = await initiatePaymentRefund({
      userId: userAliceId,
      paymentIdentifier: internalPay16Id,
      amount: 100000,
      deductFromWallet: false,
      clientOverride: mockClient16,
    });

    assert(policyResultUntouched.gatewayRefund.status === "PROCESSED", "Scenario 16: gatewayRefund reports PROCESSED");
    assert(policyResultUntouched.walletReversal.status === "UNTOUCHED", "Scenario 16: walletReversal reports UNTOUCHED");
    assert(policyResultUntouched.reconciled === false, "Scenario 16: reconciled is explicitly FALSE when wallet is untouched");

    // =========================================================================
    // SCENARIO 17: Crash Recovery via Official SDK client.payments.fetchMultipleRefund
    // =========================================================================
    console.log("\n--- Scenario 17: Crash Recovery via SDK fetchMultipleRefund ---");
    const order17Id = `order_rfnd_crash_${Date.now()}`;
    const pay17Id = `pay_rfnd_crash_${Date.now()}`;
    const internalPay17Id = `PAY_RFND_17_${Date.now()}`;
    const internalRfnd17Id = `RFND_CRASH_${Date.now()}`;
    const rzpRfnd17Id = `rfnd_actual_gateway_17_${Date.now()}`;

    await PaymentModel.create({
      userId: userAliceId,
      internalPaymentId: internalPay17Id,
      razorpayOrderId: order17Id,
      razorpayPaymentId: pay17Id,
      amount: 400000,
      status: "CREDITED",
    });

    // Simulate crash: durable record exists with status PENDING, but razorpayRefundId is NULL
    // (Server crashed before gateway response could be saved to DB)
    await RefundModel.create({
      refundId: internalRfnd17Id,
      paymentId: internalPay17Id,
      internalPaymentId: internalPay17Id,
      razorpayPaymentId: pay17Id,
      razorpayRefundId: null, // NOT persisted due to crash!
      userId: userAliceId,
      amount: 400000,
      amountRupees: 4000,
      status: "PENDING",
      createdAt: new Date(Date.now() - 180000), // 3 minutes ago
    });

    // Mock client matching the EXACT signature and response format of Razorpay SDK v2.9.8
    let refundCallCount = 0;
    const mockSdkClient17 = {
      payments: {
        refund: async () => {
          refundCallCount++;
          throw new Error("Must never issue another refund during reconciliation!");
        },
        fetchMultipleRefund: async (paymentId, params) => {
          assert(params && typeof params.count === "number", "Scenario 17: fetchMultipleRefund passed pagination count");
          if (paymentId === pay17Id) {
            assert(paymentId === pay17Id, "Scenario 17: Called fetchMultipleRefund with correct paymentId");
            // Realistic Razorpay v2.9.8 response shape: { entity: "collection", count: 1, items: [...] }
            return {
              entity: "collection",
              count: 1,
              items: [
                {
                  id: rzpRfnd17Id,
                  entity: "refund",
                  amount: 400000,
                  currency: "INR",
                  payment_id: paymentId,
                  notes: {
                    internalRefundId: internalRfnd17Id,
                    reason: "User requested refund",
                  },
                  receipt: internalRfnd17Id,
                  status: "processed",
                  speed_processed: "normal",
                  created_at: Math.floor(Date.now() / 1000),
                },
              ],
            };
          }
          return { entity: "collection", count: 0, items: [] };
        },
      },
    };

    const recResult17 = await reconcilePendingRefunds({
      staleThresholdMs: 60000,
      clientOverride: mockSdkClient17,
    });

    assert(recResult17.reconciled >= 1, "Scenario 17: Successfully reconciled unlinked pending refund via fetchMultipleRefund");
    assert(refundCallCount === 0, "Scenario 17: Recovery strictly did NOT issue a second refund");

    const recoveredDoc17 = await RefundModel.findOne({ refundId: internalRfnd17Id });
    assert(recoveredDoc17.status === "PROCESSED", "Scenario 17: Refund status updated to PROCESSED");
    assert(recoveredDoc17.razorpayRefundId === rzpRfnd17Id, "Scenario 17: razorpayRefundId recovered and persisted");

    const payment17After = await PaymentModel.findOne({ internalPaymentId: internalPay17Id });
    assert(payment17After.amountRefunded === 400000, "Scenario 17: Payment amountRefunded updated to ₹4,000");
    assert(payment17After.refundStatus === "FULL", "Scenario 17: Payment refundStatus updated to FULL");

    // =========================================================================
    // SCENARIO 18: Payin Accounting & Non-Negative Floor Protection
    // =========================================================================
    console.log("\n--- Scenario 18: Payin Accounting & Non-Negative Floor Protection ---");
    const userDavidId = `david_payin_${Date.now()}`;

    // David has ₹5,000 availableMargin and availableCash (e.g. from trading profits), but payin is only ₹1,000!
    await FundsModel.create({
      userId: userDavidId,
      availableCash: 5000,
      availableMargin: 5000,
      usedMargin: 0,
      payin: 1000, // Payin is LESS than refund amount (₹3,000)
    });

    const order18Id = `order_rfnd_payin_${Date.now()}`;
    const pay18Id = `pay_rfnd_payin_${Date.now()}`;
    const internalPay18Id = `PAY_RFND_18_${Date.now()}`;

    await PaymentModel.create({
      userId: userDavidId,
      internalPaymentId: internalPay18Id,
      razorpayOrderId: order18Id,
      razorpayPaymentId: pay18Id,
      amount: 300000, // ₹3,000 refund request
      status: "CREDITED",
    });

    const mockClient18 = {
      payments: {
        refund: async (targetPayId, opts) => ({
          id: `rfnd_18_${Date.now()}`,
          entity: "refund",
          amount: opts.amount,
          payment_id: targetPayId,
          status: "processed",
        }),
      },
    };

    const res18 = await initiatePaymentRefund({
      userId: userDavidId,
      paymentIdentifier: internalPay18Id,
      amount: 300000,
      deductFromWallet: true,
      clientOverride: mockClient18,
    });

    assert(res18.success === true, "Scenario 18: Refund of ₹3,000 succeeded");
    assert(res18.walletReversal.status === "DEDUCTED", "Scenario 18: Wallet deduction succeeded");

    const davidFundsAfter = await FundsModel.findOne({ userId: userDavidId });
    assert(davidFundsAfter.availableMargin === 2000, "Scenario 18: Available margin reduced from ₹5000 to ₹2000");
    assert(davidFundsAfter.availableCash === 2000, "Scenario 18: Available cash reduced from ₹5000 to ₹2000");
    assert(davidFundsAfter.payin === 0, "Scenario 18: Payin bounded at ₹0 (never negative, was ₹1,000 - ₹3,000)");
    assert(davidFundsAfter.payin >= 0, "Scenario 18: Payin is strictly non-negative");

    // =========================================================================
    // SCENARIO 19: Concurrent Payin Race Under Real Load
    // =========================================================================
    console.log("\n--- Scenario 19: Concurrent Payin Race Under Real Load ---");
    const userEveId = `eve_concurrent_payin_${Date.now()}`;
    await FundsModel.create({
      userId: userEveId,
      availableCash: 5000,
      availableMargin: 5000,
      usedMargin: 0,
      payin: 1000, // Initial payin is ₹1,000
    });

    const order19AId = `order_rfnd_19a_${Date.now()}`;
    const pay19AId = `pay_rfnd_19a_${Date.now()}`;
    const internalPay19AId = `PAY_RFND_19A_${Date.now()}`;

    const order19BId = `order_rfnd_19b_${Date.now()}`;
    const pay19BId = `pay_rfnd_19b_${Date.now()}`;
    const internalPay19BId = `PAY_RFND_19B_${Date.now()}`;

    await PaymentModel.create({
      userId: userEveId,
      internalPaymentId: internalPay19AId,
      razorpayOrderId: order19AId,
      razorpayPaymentId: pay19AId,
      amount: 80000, // ₹800
      status: "CREDITED",
    });

    await PaymentModel.create({
      userId: userEveId,
      internalPaymentId: internalPay19BId,
      razorpayOrderId: order19BId,
      razorpayPaymentId: pay19BId,
      amount: 80000, // ₹800
      status: "CREDITED",
    });

    const mockClient19 = {
      payments: {
        refund: async (targetPayId, opts) => ({
          id: `rfnd_19_${Date.now()}_${Math.random()}`,
          entity: "refund",
          amount: opts.amount,
          payment_id: targetPayId,
          status: "processed",
        }),
      },
    };

    // Execute two ₹800 refunds concurrently against the same user with ₹1,000 payin
    const [res19A, res19B] = await Promise.all([
      initiatePaymentRefund({
        userId: userEveId,
        paymentIdentifier: internalPay19AId,
        amount: 80000,
        deductFromWallet: true,
        clientOverride: mockClient19,
      }),
      initiatePaymentRefund({
        userId: userEveId,
        paymentIdentifier: internalPay19BId,
        amount: 80000,
        deductFromWallet: true,
        clientOverride: mockClient19,
      }),
    ]);

    assert(res19A.success === true, "Scenario 19: Refund A succeeded");
    assert(res19B.success === true, "Scenario 19: Refund B succeeded");
    assert(res19A.walletReversal.status === "DEDUCTED", "Scenario 19: Refund A wallet deducted");
    assert(res19B.walletReversal.status === "DEDUCTED", "Scenario 19: Refund B wallet deducted");

    const eveFundsAfter = await FundsModel.findOne({ userId: userEveId });
    // Total cash & margin deducted: ₹800 + ₹800 = ₹1,600 (5,000 - 1,600 = 3,400)
    assert(eveFundsAfter.availableMargin === 3400, "Scenario 19: Margin deducted full ₹1,600 (now ₹3,400)");
    assert(eveFundsAfter.availableCash === 3400, "Scenario 19: Cash deducted full ₹1,600 (now ₹3,400)");
    // Payin must NEVER be negative (initial ₹1,000 clamped cleanly at ₹0)
    assert(eveFundsAfter.payin === 0, "Scenario 19: Payin clamped cleanly at ₹0 (never negative)");
    assert(eveFundsAfter.payin >= 0, "Scenario 19: Payin is strictly non-negative");

    // =========================================================================
    // SCENARIO 20: Definite Gateway Rejection vs Network Timeout
    // =========================================================================
    console.log("\n--- Scenario 20: Definite Gateway Rejection vs Network Timeout ---");
    const userFrankId = `frank_timeout_${Date.now()}`;
    await FundsModel.create({
      userId: userFrankId,
      availableCash: 2000,
      availableMargin: 2000,
      usedMargin: 0,
      payin: 2000,
    });

    const order20AId = `order_rfnd_20a_${Date.now()}`;
    const pay20AId = `pay_rfnd_20a_${Date.now()}`;
    const internalPay20AId = `PAY_RFND_20A_${Date.now()}`;

    await PaymentModel.create({
      userId: userFrankId,
      internalPaymentId: internalPay20AId,
      razorpayOrderId: order20AId,
      razorpayPaymentId: pay20AId,
      amount: 50000, // ₹500
      status: "CREDITED",
    });

    // Subtest 20A: Definite Gateway Rejection (HTTP 400 Bad Request)
    const mockRejectClient = {
      payments: {
        refund: async () => {
          const err = new Error("Payment already refunded or refund amount exceeds captured amount.");
          err.statusCode = 400;
          err.error = { description: "Payment already refunded or refund amount exceeds captured amount." };
          throw err;
        },
      },
    };

    let rejectError = null;
    try {
      await initiatePaymentRefund({
        userId: userFrankId,
        paymentIdentifier: internalPay20AId,
        amount: 50000,
        deductFromWallet: true,
        clientOverride: mockRejectClient,
      });
    } catch (err) {
      rejectError = err;
    }
    assert(rejectError !== null, "Scenario 20a: Gateway rejection threw error");
    assert(rejectError.statusCode === 400, "Scenario 20a: Gateway rejection reported statusCode 400");

    const frankFundsAfterReject = await FundsModel.findOne({ userId: userFrankId });
    assert(frankFundsAfterReject.availableMargin === 2000, "Scenario 20a: Wallet funds restored upon definite rejection (margin ₹2,000)");
    assert(frankFundsAfterReject.availableCash === 2000, "Scenario 20a: Wallet cash restored upon definite rejection (cash ₹2,000)");

    const failedRefundDoc = await RefundModel.findOne({ internalPaymentId: internalPay20AId });
    assert(failedRefundDoc.status === "FAILED", "Scenario 20a: Refund status marked FAILED in DB");
    assert(failedRefundDoc.walletDeductionStatus === "ROLLED_BACK", "Scenario 20a: Wallet deduction rolled back");

    // Subtest 20B: Network Timeout / Uncertain Gateway Outcome (ETIMEDOUT)
    const order20BId = `order_rfnd_20b_${Date.now()}`;
    const pay20BId = `pay_rfnd_20b_${Date.now()}`;
    const internalPay20BId = `PAY_RFND_20B_${Date.now()}`;

    await PaymentModel.create({
      userId: userFrankId,
      internalPaymentId: internalPay20BId,
      razorpayOrderId: order20BId,
      razorpayPaymentId: pay20BId,
      amount: 50000, // ₹500
      status: "CREDITED",
    });

    const mockTimeoutClient = {
      payments: {
        refund: async () => {
          const err = new Error("Gateway connection timed out while awaiting refund acknowledgement.");
          err.code = "ETIMEDOUT";
          err.statusCode = 504;
          throw err;
        },
      },
    };

    let timeoutError = null;
    try {
      await initiatePaymentRefund({
        userId: userFrankId,
        paymentIdentifier: internalPay20BId,
        amount: 50000,
        deductFromWallet: true,
        clientOverride: mockTimeoutClient,
      });
    } catch (err) {
      timeoutError = err;
    }

    assert(timeoutError !== null, "Scenario 20b: Network timeout threw error");
    assert(timeoutError.isUncertain === true, "Scenario 20b: Error flagged with isUncertain: true");

    const uncertainRefundDoc = await RefundModel.findOne({ internalPaymentId: internalPay20BId });
    assert(uncertainRefundDoc.status === "PENDING", "Scenario 20b: Refund retained in PENDING status");
    assert(uncertainRefundDoc.isGatewayUncertain === true, "Scenario 20b: Refund marked isGatewayUncertain: true");
    assert(uncertainRefundDoc.reconciliationStatus === "UNRECONCILED", "Scenario 20b: Reconciliation queued");

    const frankFundsAfterTimeout = await FundsModel.findOne({ userId: userFrankId });
    // Wallet deduction is NOT restored automatically on timeout to prevent double-spending!
    assert(frankFundsAfterTimeout.availableMargin === 1500, "Scenario 20b: Margin deduction retained (₹1,500, not restored)");
    assert(frankFundsAfterTimeout.availableCash === 1500, "Scenario 20b: Cash deduction retained (₹1,500, not restored)");

    // =========================================================================
    // SCENARIO 21: Connection Reset (ECONNRESET) Safety
    // =========================================================================
    console.log("\n--- Scenario 21: Connection Reset (ECONNRESET) Safety ---");
    const userGraceId = `grace_connreset_${Date.now()}`;
    await FundsModel.create({
      userId: userGraceId,
      availableCash: 1000,
      availableMargin: 1000,
      usedMargin: 0,
      payin: 1000,
    });

    const order21Id = `order_rfnd_21_${Date.now()}`;
    const pay21Id = `pay_rfnd_21_${Date.now()}`;
    const internalPay21Id = `PAY_RFND_21_${Date.now()}`;

    await PaymentModel.create({
      userId: userGraceId,
      internalPaymentId: internalPay21Id,
      razorpayOrderId: order21Id,
      razorpayPaymentId: pay21Id,
      amount: 40000, // ₹400
      status: "CREDITED",
    });

    const mockResetClient = {
      payments: {
        refund: async () => {
          const err = new Error("read ECONNRESET");
          err.code = "ECONNRESET";
          throw err;
        },
      },
    };

    let resetError = null;
    try {
      await initiatePaymentRefund({
        userId: userGraceId,
        paymentIdentifier: internalPay21Id,
        amount: 40000,
        deductFromWallet: true,
        clientOverride: mockResetClient,
      });
    } catch (err) {
      resetError = err;
    }

    assert(resetError !== null, "Scenario 21: ECONNRESET threw error");
    assert(resetError.isUncertain === true, "Scenario 21: ECONNRESET identified as uncertain gateway outcome");

    const graceRefundDoc = await RefundModel.findOne({ internalPaymentId: internalPay21Id });
    assert(graceRefundDoc.status === "PENDING", "Scenario 21: Refund remains PENDING");
    assert(graceRefundDoc.isGatewayUncertain === true, "Scenario 21: isGatewayUncertain set to true");

    const graceFundsAfter = await FundsModel.findOne({ userId: userGraceId });
    assert(graceFundsAfter.availableMargin === 600, "Scenario 21: Wallet deduction retained safely (₹600)");

    // =========================================================================
    // SCENARIO 22: Stale PENDING Exceeded Max Reconciliation Attempts -> FLAGGED
    // =========================================================================
    console.log("\n--- Scenario 22: Stale PENDING Exceeded Max Reconciliation Attempts -> FLAGGED ---");
    const internalRfnd22Id = `RFND_STALE_FLAG_${Date.now()}`;
    const pay22Id = `pay_rfnd_22_${Date.now()}`;
    const internalPay22Id = `PAY_RFND_22_${Date.now()}`;

    await PaymentModel.create({
      userId: userGraceId,
      internalPaymentId: internalPay22Id,
      razorpayOrderId: `order_22_${Date.now()}`,
      razorpayPaymentId: pay22Id,
      amount: 30000,
      status: "CREDITED",
    });

    await RefundModel.create({
      refundId: internalRfnd22Id,
      paymentId: internalPay22Id,
      internalPaymentId: internalPay22Id,
      razorpayPaymentId: pay22Id,
      razorpayRefundId: null,
      userId: userGraceId,
      amount: 30000,
      amountRupees: 300,
      status: "PENDING",
      reconciliationAttempts: 9, // Already attempted 9 times
      reconciliationStatus: "UNRECONCILED",
      createdAt: new Date(Date.now() - 120000), // 2 mins ago
    });

    const mockEmptyRecClient = {
      payments: {
        fetchMultipleRefund: async () => ({
          entity: "collection",
          count: 0,
          items: [],
        }),
      },
    };

    const recFlagResult = await reconcilePendingRefunds({
      staleThresholdMs: 60000,
      clientOverride: mockEmptyRecClient,
    });

    assert(recFlagResult.count >= 1, "Scenario 22: Stale refund picked up for reconciliation");
    const flaggedDoc = await RefundModel.findOne({ refundId: internalRfnd22Id });
    assert(flaggedDoc.reconciliationAttempts === 10, "Scenario 22: Attempts incremented to 10");
    assert(flaggedDoc.reconciliationStatus === "FLAGGED", "Scenario 22: Status transitioned to FLAGGED");
    assert(flaggedDoc.status === "PENDING", "Scenario 22: Status remains PENDING (never marked FAILED or refunded twice)");

    // =========================================================================
    // SCENARIO 23: Late & Duplicate refund.processed Webhook Handling
    // =========================================================================
    console.log("\n--- Scenario 23: Late & Duplicate refund.processed Webhook Handling ---");
    const rzpLateRefundId = `rfnd_late_${Date.now()}`;

    // Process late webhook for the uncertain refund from Scenario 20B
    const lateWebhookRes = await handleRefundWebhookEvent({
      eventType: "refund.processed",
      refundEntity: {
        id: rzpLateRefundId,
        payment_id: pay20BId,
        amount: 50000,
        status: "processed",
        notes: {
          internalRefundId: uncertainRefundDoc.refundId,
        },
      },
    });

    assert(lateWebhookRes.success === true, "Scenario 23: Late webhook handled successfully");
    assert(lateWebhookRes.isDuplicate === false, "Scenario 23: Initial webhook is not duplicate");

    const resolvedAfterWebhook = await RefundModel.findOne({ refundId: uncertainRefundDoc.refundId });
    assert(resolvedAfterWebhook.status === "PROCESSED", "Scenario 23: Uncertain refund transitioned to PROCESSED via webhook");
    assert(resolvedAfterWebhook.razorpayRefundId === rzpLateRefundId, "Scenario 23: Gateway refund ID updated");

    // Verify wallet balance was NOT debited a second time
    const frankFundsAfterWebhook = await FundsModel.findOne({ userId: userFrankId });
    assert(frankFundsAfterWebhook.availableMargin === 1500, "Scenario 23: Wallet was NOT double-debited (margin remains ₹1,500)");

    // Process duplicate webhook delivery of the same event
    const duplicateWebhookRes = await handleRefundWebhookEvent({
      eventType: "refund.processed",
      refundEntity: {
        id: rzpLateRefundId,
        payment_id: pay20BId,
        amount: 50000,
        status: "processed",
      },
    });

    assert(duplicateWebhookRes.success === true, "Scenario 23: Duplicate webhook handled cleanly");
    assert(duplicateWebhookRes.isDuplicate === true, "Scenario 23: Duplicate webhook identified with isDuplicate: true");

    // =========================================================================
    // SCENARIO 24: Standalone MongoDB Transaction Support Safety
    // =========================================================================
    console.log("\n--- Scenario 24: Standalone MongoDB Transaction Support Safety ---");
    const isSupported = isTransactionSupported();
    console.log(`[Scenario 24] Current connection topology supports transactions: ${isSupported}`);
    assert(typeof isSupported === "boolean", "Scenario 24: isTransactionSupported returns boolean");
    // Verify that on the current connection, the topology description is properly read
    const topologyDesc = mongoose.connection?.client?.topology?.description;
    if (topologyDesc) {
      const isRepl = topologyDesc.type?.includes("ReplicaSet") || Boolean(topologyDesc.setName);
      assert(isSupported === Boolean(isRepl), "Scenario 24: Topology check accurately mirrors client configuration");
    }

    // Cleanup test data
    await PaymentModel.deleteMany({ userId: { $in: [userAliceId, userBobId, userLowMarginId, userCharlieId, userDavidId, userEveId, userFrankId, userGraceId] } });
    await FundsModel.deleteMany({ userId: { $in: [userAliceId, userBobId, userLowMarginId, userCharlieId, userDavidId, userEveId, userFrankId, userGraceId] } });
    await WalletTransactionModel.deleteMany({ userId: { $in: [userAliceId, userBobId, userLowMarginId, userCharlieId, userDavidId, userEveId, userFrankId, userGraceId] } });
    await RefundModel.deleteMany({ userId: { $in: [userAliceId, userBobId, userLowMarginId, userCharlieId, userDavidId, userEveId, userFrankId, userGraceId] } });

    console.log("\n================================================================");
    console.log(`REFUND TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("================================================================");

    server.close();
    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed with unhandled exception:", err);
    server.close();
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runPaymentRefundTestSuite();

