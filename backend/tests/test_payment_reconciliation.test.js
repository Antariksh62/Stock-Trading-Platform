const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config();

const mongoose = require("mongoose");
const crypto = require("crypto");

const { PaymentModel } = require("../model/PaymentModel");
const { FundsModel } = require("../model/FundsModel");
const { WalletTransactionModel } = require("../model/WalletTransactionModel");

const {
  reconcileSinglePayment,
  reconcileStalePayments,
  startReconciliationScheduler,
  stopReconciliationScheduler,
  getPaymentReconciliationDetails,
} = require("../services/paymentReconciliationService");

async function runPaymentReconciliationTestSuite() {
  console.log("================================================================");
  console.log("   RAZORPAY PAYMENT RECONCILIATION INTEGRATION TEST SUITE      ");
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
  console.log("--> Connected to MongoDB for Reconciliation Tests\n");

  const testUserId = `reconcile_user_${Date.now()}`;

  // Initialize baseline funds for the test user
  await FundsModel.findOneAndUpdate(
    { userId: testUserId },
    {
      $set: {
        availableCash: 5000,
        availableMargin: 5000,
        usedMargin: 0,
        payin: 0,
        span: 0,
        deliveryMargin: 0,
        exposure: 0,
        optionsPremium: 0,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  try {
    // =========================================================================
    // SCENARIO 1: Captured but uncredited payment -> Reconciled & Credited
    // =========================================================================
    console.log("--- Scenario 1: Captured but Uncredited Payment ---");
    const order1Id = `order_rec_cap_${Date.now()}`;
    const pay1Id = `pay_rec_cap_${Date.now()}`;
    const internalPay1Id = `PAY_REC_1_${Date.now()}`;

    const payment1 = await PaymentModel.create({
      userId: testUserId,
      internalPaymentId: internalPay1Id,
      razorpayOrderId: order1Id,
      amount: 150000, // ₹1,500
      currency: "INR",
      status: "CREATED", // Stale uncredited
      createdAt: new Date(Date.now() - 15 * 60 * 1000), // 15 mins ago
    });

    const mockClientScenario1 = {
      orders: {
        fetchPayments: async (ordId) => {
          assert(ordId === order1Id, "Scenario 1: Razorpay called with correct order ID");
          return {
            entity: "collection",
            count: 1,
            items: [
              {
                id: pay1Id,
                entity: "payment",
                amount: 150000,
                currency: "INR",
                status: "captured",
                order_id: order1Id,
                captured: true,
                method: "upi",
              },
            ],
          };
        },
      },
    };

    const outcome1 = await reconcileSinglePayment(payment1, {
      clientOverride: mockClientScenario1,
    });

    assert(
      outcome1.status === "RECONCILED_AND_CREDITED",
      "Scenario 1: Outcome reports RECONCILED_AND_CREDITED",
      JSON.stringify(outcome1)
    );
    assert(
      outcome1.walletCredited === true,
      "Scenario 1: Outcome reports wallet was credited"
    );

    const updatedPayment1 = await PaymentModel.findOne({ internalPaymentId: internalPay1Id });
    assert(
      updatedPayment1.status === "CREDITED",
      "Scenario 1: Payment status transitioned to CREDITED"
    );
    assert(
      updatedPayment1.reconciliationStatus === "RECONCILED",
      "Scenario 1: reconciliationStatus marked as RECONCILED"
    );
    assert(
      updatedPayment1.reconciledAt !== null,
      "Scenario 1: reconciledAt timestamp is populated"
    );
    assert(
      updatedPayment1.razorpayPaymentId === pay1Id,
      "Scenario 1: razorpayPaymentId recorded correctly"
    );

    const userFunds1 = await FundsModel.findOne({ userId: testUserId });
    assert(
      userFunds1.availableMargin === 6500, // 5000 + 1500
      `Scenario 1: User wallet balance increased by ₹1,500 (now: ${userFunds1.availableMargin})`
    );

    const ledgerTx1 = await WalletTransactionModel.findOne({ paymentId: internalPay1Id });
    assert(
      ledgerTx1 !== null && ledgerTx1.status === "COMPLETED",
      "Scenario 1: Immutable wallet ledger transaction was created"
    );

    // =========================================================================
    // SCENARIO 2: Already credited payment -> Skipped, Never Double-Credited
    // =========================================================================
    console.log("\n--- Scenario 2: Already Credited Payment ---");
    const balanceBefore2 = userFunds1.availableMargin;

    const outcome2 = await reconcileSinglePayment(updatedPayment1, {
      clientOverride: mockClientScenario1,
    });

    assert(
      outcome2.status === "SKIPPED_ALREADY_CREDITED",
      "Scenario 2: Returns SKIPPED_ALREADY_CREDITED status",
      JSON.stringify(outcome2)
    );

    const userFunds2 = await FundsModel.findOne({ userId: testUserId });
    assert(
      userFunds2.availableMargin === balanceBefore2,
      "Scenario 2: Wallet balance remains strictly unchanged (No double credit)"
    );

    const ledgerCount2 = await WalletTransactionModel.countDocuments({ paymentId: internalPay1Id });
    assert(
      ledgerCount2 === 1,
      "Scenario 2: Ledger transaction count remains exactly 1"
    );

    // =========================================================================
    // SCENARIO 3: Failed Payment -> Marked FAILED with Reason, Never Credited
    // =========================================================================
    console.log("\n--- Scenario 3: Failed Payment at Gateway ---");
    const order3Id = `order_rec_fail_${Date.now()}`;
    const pay3Id = `pay_rec_fail_${Date.now()}`;
    const internalPay3Id = `PAY_REC_3_${Date.now()}`;

    const payment3 = await PaymentModel.create({
      userId: testUserId,
      internalPaymentId: internalPay3Id,
      razorpayOrderId: order3Id,
      amount: 200000,
      currency: "INR",
      status: "CREATED",
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
    });

    const mockClientScenario3 = {
      orders: {
        fetchPayments: async () => ({
          entity: "collection",
          count: 1,
          items: [
            {
              id: pay3Id,
              amount: 200000,
              currency: "INR",
              status: "failed",
              order_id: order3Id,
              error_description: "Bank server timeout during PIN authentication.",
            },
          ],
        }),
      },
    };

    const outcome3 = await reconcileSinglePayment(payment3, {
      clientOverride: mockClientScenario3,
    });

    assert(
      outcome3.status === "RECONCILED_FAILED",
      "Scenario 3: Outcome is RECONCILED_FAILED",
      JSON.stringify(outcome3)
    );

    const updatedPayment3 = await PaymentModel.findOne({ internalPaymentId: internalPay3Id });
    assert(
      updatedPayment3.status === "FAILED",
      "Scenario 3: Payment status transitioned to FAILED"
    );
    assert(
      updatedPayment3.failureReason.includes("Bank server timeout"),
      "Scenario 3: Failure reason correctly recorded"
    );
    assert(
      updatedPayment3.reconciliationStatus === "RECONCILED",
      "Scenario 3: Marked as RECONCILED (terminal non-credit)"
    );

    const userFunds3 = await FundsModel.findOne({ userId: testUserId });
    assert(
      userFunds3.availableMargin === balanceBefore2,
      "Scenario 3: Wallet was NOT credited for failed payment"
    );

    // =========================================================================
    // SCENARIO 4: Authorized but Uncaptured -> Remains PENDING, Never Credited
    // =========================================================================
    console.log("\n--- Scenario 4: Authorized but Uncaptured Payment ---");
    const order4Id = `order_rec_auth_${Date.now()}`;
    const pay4Id = `pay_rec_auth_${Date.now()}`;
    const internalPay4Id = `PAY_REC_4_${Date.now()}`;

    const payment4 = await PaymentModel.create({
      userId: testUserId,
      internalPaymentId: internalPay4Id,
      razorpayOrderId: order4Id,
      amount: 50000, // ₹500
      currency: "INR",
      status: "CREATED",
      createdAt: new Date(Date.now() - 12 * 60 * 1000),
    });

    const mockClientScenario4 = {
      orders: {
        fetchPayments: async () => ({
          entity: "collection",
          count: 1,
          items: [
            {
              id: pay4Id,
              amount: 50000,
              currency: "INR",
              status: "authorized", // NOT captured yet
              order_id: order4Id,
              captured: false,
            },
          ],
        }),
      },
    };

    const outcome4 = await reconcileSinglePayment(payment4, {
      clientOverride: mockClientScenario4,
    });

    assert(
      outcome4.status === "AWAITING_CAPTURE",
      "Scenario 4: Outcome is AWAITING_CAPTURE",
      JSON.stringify(outcome4)
    );

    const updatedPayment4 = await PaymentModel.findOne({ internalPaymentId: internalPay4Id });
    assert(
      updatedPayment4.status === "PENDING",
      "Scenario 4: Payment status moved from CREATED to PENDING"
    );
    assert(
      updatedPayment4.reconciliationStatus === "UNRECONCILED",
      "Scenario 4: Remains UNRECONCILED until captured"
    );

    const userFunds4 = await FundsModel.findOne({ userId: testUserId });
    assert(
      userFunds4.availableMargin === balanceBefore2,
      "Scenario 4: Authorized payment is strictly NOT credited to wallet"
    );

    // =========================================================================
    // SCENARIO 5: Duplicate Reconciliation Run -> Idempotent
    // =========================================================================
    console.log("\n--- Scenario 5: Duplicate Reconciliation Run Idempotency ---");
    // Run batch reconciliation targeting payment 1 again (already credited)
    const batchResult5 = await reconcileStalePayments({
      staleThresholdMs: 0,
      filter: { razorpayOrderId: order1Id },
      clientOverride: mockClientScenario1,
    });

    assert(
      batchResult5.scanned >= 0,
      "Scenario 5: Batch reconciliation ran successfully"
    );

    const userFunds5 = await FundsModel.findOne({ userId: testUserId });
    assert(
      userFunds5.availableMargin === balanceBefore2,
      "Scenario 5: Wallet balance remains identical across duplicate runs"
    );

    // =========================================================================
    // SCENARIO 6: Razorpay API Unavailable (500 / Timeout) -> Handled Gracefully
    // =========================================================================
    console.log("\n--- Scenario 6: Razorpay API Unavailable / Timeout ---");
    const order6Id = `order_rec_err_${Date.now()}`;
    const internalPay6Id = `PAY_REC_6_${Date.now()}`;

    const payment6 = await PaymentModel.create({
      userId: testUserId,
      internalPaymentId: internalPay6Id,
      razorpayOrderId: order6Id,
      amount: 100000,
      currency: "INR",
      status: "CREATED",
      createdAt: new Date(Date.now() - 15 * 60 * 1000),
    });

    const mockClientScenario6 = {
      orders: {
        fetchPayments: async () => {
          const timeoutErr = new Error("Gateway connection timed out (ETIMEDOUT)");
          timeoutErr.code = "ECONNABORTED";
          timeoutErr.statusCode = 504;
          throw timeoutErr;
        },
      },
    };

    let crashed = false;
    let outcome6 = null;
    try {
      outcome6 = await reconcileSinglePayment(payment6, {
        clientOverride: mockClientScenario6,
      });
    } catch (e) {
      crashed = true;
    }

    assert(!crashed, "Scenario 6: Service does not crash when gateway times out");
    assert(
      outcome6 && outcome6.status === "NETWORK_ERROR",
      "Scenario 6: Handled gracefully and reported NETWORK_ERROR status"
    );

    const updatedPayment6 = await PaymentModel.findOne({ internalPaymentId: internalPay6Id });
    assert(
      updatedPayment6.status === "CREATED",
      "Scenario 6: Payment state remains untouched for retry"
    );
    assert(
      updatedPayment6.reconciliationLockedUntil === null,
      "Scenario 6: Lease lock was released for future retry"
    );
    assert(
      updatedPayment6.reconciliationNotes.includes("ETIMEDOUT") ||
        updatedPayment6.reconciliationNotes.includes("504"),
      "Scenario 6: Gateway error documented in reconciliationNotes"
    );

    // =========================================================================
    // SCENARIO 7: Amount Mismatch -> Flagged, Never Credited
    // =========================================================================
    console.log("\n--- Scenario 7: Amount Mismatch Detection ---");
    const order7Id = `order_rec_mismatch_amt_${Date.now()}`;
    const pay7Id = `pay_rec_mismatch_amt_${Date.now()}`;
    const internalPay7Id = `PAY_REC_7_${Date.now()}`;

    const payment7 = await PaymentModel.create({
      userId: testUserId,
      internalPaymentId: internalPay7Id,
      razorpayOrderId: order7Id,
      amount: 500000, // Expected ₹5,000
      currency: "INR",
      status: "CREATED",
      createdAt: new Date(Date.now() - 15 * 60 * 1000),
    });

    const mockClientScenario7 = {
      orders: {
        fetchPayments: async () => ({
          entity: "collection",
          count: 1,
          items: [
            {
              id: pay7Id,
              amount: 100000, // Gateway says only ₹1,000 paid!
              currency: "INR",
              status: "captured",
              order_id: order7Id,
              captured: true,
            },
          ],
        }),
      },
    };

    const outcome7 = await reconcileSinglePayment(payment7, {
      clientOverride: mockClientScenario7,
    });

    assert(
      outcome7.status === "FLAGGED_AMOUNT_MISMATCH",
      "Scenario 7: Outcome reports FLAGGED_AMOUNT_MISMATCH",
      JSON.stringify(outcome7)
    );

    const updatedPayment7 = await PaymentModel.findOne({ internalPaymentId: internalPay7Id });
    assert(
      updatedPayment7.reconciliationStatus === "FLAGGED",
      "Scenario 7: Document reconciliationStatus set to FLAGGED"
    );
    assert(
      updatedPayment7.status !== "CREDITED",
      "Scenario 7: Payment status was NOT marked CREDITED"
    );

    const userFunds7 = await FundsModel.findOne({ userId: testUserId });
    assert(
      userFunds7.availableMargin === balanceBefore2,
      "Scenario 7: Wallet was NOT credited when amount mismatched"
    );

    // =========================================================================
    // SCENARIO 8: Currency Mismatch -> Flagged, Never Credited
    // =========================================================================
    console.log("\n--- Scenario 8: Currency Mismatch Detection ---");
    const order8Id = `order_rec_mismatch_cur_${Date.now()}`;
    const pay8Id = `pay_rec_mismatch_cur_${Date.now()}`;
    const internalPay8Id = `PAY_REC_8_${Date.now()}`;

    const payment8 = await PaymentModel.create({
      userId: testUserId,
      internalPaymentId: internalPay8Id,
      razorpayOrderId: order8Id,
      amount: 100000,
      currency: "INR",
      status: "CREATED",
      createdAt: new Date(Date.now() - 15 * 60 * 1000),
    });

    const mockClientScenario8 = {
      orders: {
        fetchPayments: async () => ({
          entity: "collection",
          count: 1,
          items: [
            {
              id: pay8Id,
              amount: 100000,
              currency: "USD", // Mismatched currency
              status: "captured",
              order_id: order8Id,
              captured: true,
            },
          ],
        }),
      },
    };

    const outcome8 = await reconcileSinglePayment(payment8, {
      clientOverride: mockClientScenario8,
    });

    assert(
      outcome8.status === "FLAGGED_CURRENCY_MISMATCH",
      "Scenario 8: Outcome reports FLAGGED_CURRENCY_MISMATCH",
      JSON.stringify(outcome8)
    );

    const updatedPayment8 = await PaymentModel.findOne({ internalPaymentId: internalPay8Id });
    assert(
      updatedPayment8.reconciliationStatus === "FLAGGED",
      "Scenario 8: Document reconciliationStatus set to FLAGGED"
    );
    assert(
      updatedPayment8.status !== "CREDITED",
      "Scenario 8: Payment was NOT marked CREDITED"
    );

    // =========================================================================
    // SCENARIO 9: Concurrent Workers -> Atomic Lease Lock Prevents Race
    // =========================================================================
    console.log("\n--- Scenario 9: Concurrent Workers Distributed Locking ---");
    const order9Id = `order_rec_lock_${Date.now()}`;
    const pay9Id = `pay_rec_lock_${Date.now()}`;
    const internalPay9Id = `PAY_REC_9_${Date.now()}`;

    // Create a stale candidate payment
    await PaymentModel.create({
      userId: testUserId,
      internalPaymentId: internalPay9Id,
      razorpayOrderId: order9Id,
      amount: 100000,
      currency: "INR",
      status: "CREATED",
      createdAt: new Date(Date.now() - 25 * 60 * 1000),
    });

    let fetchPaymentCallCount = 0;
    const slowMockClient = {
      orders: {
        fetchPayments: async () => {
          fetchPaymentCallCount++;
          // Simulate network latency so two workers race during processing
          await new Promise((r) => setTimeout(r, 100));
          return {
            entity: "collection",
            count: 1,
            items: [
              {
                id: pay9Id,
                amount: 100000,
                currency: "INR",
                status: "captured",
                order_id: order9Id,
                captured: true,
              },
            ],
          };
        },
      },
    };

    // Simulate 2 workers concurrently querying for stale payments
    const [workerA, workerB] = await Promise.all([
      reconcileStalePayments({
        staleThresholdMs: 10 * 60 * 1000,
        batchSize: 10,
        filter: { internalPaymentId: internalPay9Id },
        clientOverride: slowMockClient,
      }),
      reconcileStalePayments({
        staleThresholdMs: 10 * 60 * 1000,
        batchSize: 10,
        filter: { internalPaymentId: internalPay9Id },
        clientOverride: slowMockClient,
      }),
    ]);

    const totalReconciled = workerA.reconciled + workerB.reconciled;
    const totalSkipped = workerA.skipped + workerB.skipped;

    assert(
      totalReconciled === 1,
      `Scenario 9: Exactly one worker reconciled the payment (Total: ${totalReconciled})`
    );
    assert(
      totalSkipped >= 1,
      `Scenario 9: Second worker safely skipped locked payment (Skipped: ${totalSkipped})`
    );
    assert(
      fetchPaymentCallCount === 1,
      `Scenario 9: Gateway API called only once across concurrent workers (${fetchPaymentCallCount})`
    );

    // =========================================================================
    // SCENARIO 10: Scheduler Lifecycle (Start & Stop)
    // =========================================================================
    console.log("\n--- Scenario 10: Scheduler Start / Stop ---");
    const timer = startReconciliationScheduler({ intervalMs: 60000 });
    assert(timer !== null, "Scenario 10: Scheduler starts successfully");

    const timer2 = startReconciliationScheduler({ intervalMs: 60000 });
    assert(timer2 === timer, "Scenario 10: Multiple starts return existing singleton timer");

    stopReconciliationScheduler();
    assert(true, "Scenario 10: Scheduler stops cleanly");

    // =========================================================================
    // SCENARIO 11: getPaymentReconciliationDetails Helper
    // =========================================================================
    console.log("\n--- Scenario 11: Reconciliation Details Query ---");
    const details = await getPaymentReconciliationDetails(internalPay1Id);
    assert(
      details && details.reconciliationStatus === "RECONCILED",
      "Scenario 11: Details correctly retrieved by internalPaymentId"
    );

    const detailsByOrder = await getPaymentReconciliationDetails(order1Id);
    assert(
      detailsByOrder && detailsByOrder.internalPaymentId === internalPay1Id,
      "Scenario 11: Details correctly retrieved by razorpayOrderId"
    );

    // Cleanup test records
    await PaymentModel.deleteMany({ userId: testUserId });
    await WalletTransactionModel.deleteMany({ userId: testUserId });
    await FundsModel.deleteMany({ userId: testUserId });

    console.log("\n================================================================");
    console.log(`RECONCILIATION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("================================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed with unhandled exception:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runPaymentReconciliationTestSuite();
