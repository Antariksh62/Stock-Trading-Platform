const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const { OrdersModel } = require("../model/OrdersModel");
const { HoldingsModel } = require("../model/HoldingsModel");
const { PositionsModel } = require("../model/PositionsModel");
const { FundsModel } = require("../model/FundsModel");
const { tickerService } = require("../services/tickerService");
const {
  processOrder,
  cancelOrder,
  executeMatchingOrder,
  matchPendingOrdersForStock,
  getOrCreateUserFunds,
} = require("../services/orderExecutionService");

const TEST_USER = "test_limit_runner_" + Date.now();
const URI = process.env.MONGO_URL;

async function runTestSuite() {
  console.log("==================================================================");
  console.log("   LIMIT ORDER PLACEMENT & MATCHING ENGINE - TEST SUITE");
  console.log("==================================================================\n");

  if (!URI) {
    console.error("FATAL: MONGO_URL not defined in .env");
    process.exit(1);
  }

  await mongoose.connect(URI);
  console.log(" Connected to MongoDB Atlas for test execution.\n");

  let passed = 0;
  let failed = 0;
  const results = [];

  function assert(condition, scenario, details = "") {
    if (condition) {
      console.log(`[PASS] ${scenario}`);
      if (details) console.log(`       ↳ ${details}`);
      passed++;
      results.push({ scenario, status: "PASS", details });
    } else {
      console.error(`[FAIL] ${scenario}`);
      if (details) console.error(`       ↳ ${details}`);
      failed++;
      results.push({ scenario, status: "FAIL", details });
    }
  }

  try {
    // 0. Setup Initial Funds for Test User: ₹1,00,000.00
    const funds = await getOrCreateUserFunds(TEST_USER);
    funds.availableCash = 100000.0;
    funds.availableMargin = 100000.0;
    funds.usedMargin = 0.0;
    funds.deliveryMargin = 0.0;
    await funds.save();

    // Ensure baseline price for RELIANCE is 2890.50
    await tickerService.updateQuote("RELIANCE", 2890.50);
    const baselinePrice = tickerService.getMarketPrice("RELIANCE");

    // =================================================================
    // SCENARIO 1: Market BUY - Executes using available market price
    // =================================================================
    console.log("\n--- Scenario 1: Market BUY ---");
    const mktBuyRes = await processOrder({
      userId: TEST_USER,
      name: "RELIANCE",
      qty: 2,
      orderType: "MARKET",
      mode: "BUY",
      product: "CNC",
    });
    assert(
      mktBuyRes.success &&
      mktBuyRes.status === "FILLED" &&
      mktBuyRes.order.executionPrice === baselinePrice &&
      mktBuyRes.order.price === baselinePrice,
      "Scenario 1: Market BUY executes at available market price",
      `Executed 2 shares @ ₹${mktBuyRes.order.executionPrice}`
    );

    // Verify holding created
    const h1 = await HoldingsModel.findOne({ userId: TEST_USER, name: "RELIANCE" });
    assert(
      h1 && h1.qty === 2 && h1.avg === baselinePrice,
      "Scenario 1 (Check): Holdings updated with correct qty (2) and avg cost",
      `Holdings: ${h1?.qty} shares @ ₹${h1?.avg}`
    );

    // =================================================================
    // SCENARIO 2: Market SELL - Executes using available market price
    // =================================================================
    console.log("\n--- Scenario 2: Market SELL ---");
    const mktSellRes = await processOrder({
      userId: TEST_USER,
      name: "RELIANCE",
      qty: 1,
      orderType: "MARKET",
      mode: "SELL",
      product: "CNC",
    });
    const h2 = await HoldingsModel.findOne({ userId: TEST_USER, name: "RELIANCE" });
    assert(
      mktSellRes.success &&
      mktSellRes.status === "FILLED" &&
      mktSellRes.order.executionPrice === baselinePrice &&
      h2 && h2.qty === 1,
      "Scenario 2: Market SELL executes at market price and decrements holdings",
      `Sold 1 share @ ₹${mktSellRes.order.executionPrice}. Remaining holding: ${h2?.qty}`
    );

    // =================================================================
    // SCENARIO 3: Limit BUY above available ask - Eligible for immediate execution
    // =================================================================
    console.log("\n--- Scenario 3: Limit BUY Above Available Ask ---");
    // Market is 2890.50, limit buy price is 2950.00
    const immLimitBuy = await processOrder({
      userId: TEST_USER,
      name: "RELIANCE",
      qty: 2,
      orderType: "LIMIT",
      limitPrice: 2950.00,
      mode: "BUY",
      product: "CNC",
    });
    assert(
      immLimitBuy.success &&
      immLimitBuy.status === "FILLED" &&
      immLimitBuy.order.executionPrice === baselinePrice && // Price improvement!
      immLimitBuy.order.limitPrice === 2950.00,
      "Scenario 3: Limit BUY above available ask executes immediately at market price",
      `Limit was ₹2950.00, executed at market ask: ₹${immLimitBuy.order.executionPrice}`
    );

    // =================================================================
    // SCENARIO 4: Limit BUY below available ask - Remains pending
    // =================================================================
    console.log("\n--- Scenario 4: Limit BUY Below Available Ask ---");
    // Market is 2890.50, limit buy price is 2800.00
    const preFunds4 = await getOrCreateUserFunds(TEST_USER);
    const preCash4 = preFunds4.availableCash;

    const pendLimitBuy = await processOrder({
      userId: TEST_USER,
      name: "RELIANCE",
      qty: 3,
      orderType: "LIMIT",
      limitPrice: 2800.00,
      mode: "BUY",
      product: "CNC",
    });
    const postFunds4 = await getOrCreateUserFunds(TEST_USER);
    const expectedReserve = 3 * 2800.00; // 8400.00

    assert(
      pendLimitBuy.success &&
      pendLimitBuy.status === "PENDING" &&
      pendLimitBuy.order.executionPrice === null &&
      pendLimitBuy.order.limitPrice === 2800.00 &&
      Number((preCash4 - postFunds4.availableCash).toFixed(2)) === expectedReserve,
      "Scenario 4: Limit BUY below available ask remains PENDING and reserves margin",
      `Status: ${pendLimitBuy.status}, Reserved cash: ₹${expectedReserve}`
    );

    // =================================================================
    // SCENARIO 5: Limit SELL below available bid - Eligible for immediate execution
    // =================================================================
    console.log("\n--- Scenario 5: Limit SELL Below Available Bid ---");
    // User owns 3 shares from previous buys. Market is 2890.50, limit sell price is 2800.00
    const immLimitSell = await processOrder({
      userId: TEST_USER,
      name: "RELIANCE",
      qty: 1,
      orderType: "LIMIT",
      limitPrice: 2800.00,
      mode: "SELL",
      product: "CNC",
    });
    assert(
      immLimitSell.success &&
      immLimitSell.status === "FILLED" &&
      immLimitSell.order.executionPrice === baselinePrice && // Price improvement!
      immLimitSell.order.limitPrice === 2800.00,
      "Scenario 5: Limit SELL below available bid executes immediately at market price",
      `Limit was ₹2800.00, executed at market bid: ₹${immLimitSell.order.executionPrice}`
    );

    // =================================================================
    // SCENARIO 6: Limit SELL above available bid - Remains pending
    // =================================================================
    console.log("\n--- Scenario 6: Limit SELL Above Available Bid ---");
    // User currently owns 2 shares. Limit sell price is 3100.00 (> market 2890.50)
    const pendLimitSell = await processOrder({
      userId: TEST_USER,
      name: "RELIANCE",
      qty: 1,
      orderType: "LIMIT",
      limitPrice: 3100.00,
      mode: "SELL",
      product: "CNC",
    });
    const holdingAfterLock = await HoldingsModel.findOne({ userId: TEST_USER, name: "RELIANCE" });

    assert(
      pendLimitSell.success &&
      pendLimitSell.status === "PENDING" &&
      pendLimitSell.order.executionPrice === null &&
      holdingAfterLock && holdingAfterLock.lockedQty === 1,
      "Scenario 6: Limit SELL above available bid remains PENDING and locks shares",
      `Status: ${pendLimitSell.status}, Locked shares: ${holdingAfterLock?.lockedQty} of ${holdingAfterLock?.qty}`
    );

    // =================================================================
    // SCENARIO 7: Pending BUY reaches limit - Executes automatically
    // =================================================================
    console.log("\n--- Scenario 7: Pending BUY Reaches Limit ---");
    // We have a pending limit buy order (from Scenario 4) with limitPrice 2800.00, qty 3.
    // Price was 2890.50. Now market drops to 2795.00 (<= 2800.00).
    const preCash7 = (await getOrCreateUserFunds(TEST_USER)).availableCash;
    const preHoldQty7 = (await HoldingsModel.findOne({ userId: TEST_USER, name: "RELIANCE" }))?.qty || 0;

    await tickerService.updateQuote("RELIANCE", 2795.00);
    const matchBuyResults = await matchPendingOrdersForStock("RELIANCE", 2795.00);

    const postOrder7 = await OrdersModel.findById(pendLimitBuy.order._id);
    const postFunds7 = await getOrCreateUserFunds(TEST_USER);
    const postHold7 = await HoldingsModel.findOne({ userId: TEST_USER, name: "RELIANCE" });

    // The order had reserved 3 * 2800 = 8400. Actual cost was 3 * 2795 = 8385.
    // Price improvement refund = 8400 - 8385 = ₹15.00 refunded to availableCash!
    const expectedRefund = 15.00;

    assert(
      matchBuyResults.length >= 1 &&
      postOrder7.status === "FILLED" &&
      postOrder7.executionPrice === 2795.00 &&
      postHold7.qty === preHoldQty7 + 3 &&
      Number((postFunds7.availableCash - preCash7).toFixed(2)) === expectedRefund,
      "Scenario 7: Pending BUY reaches limit and executes with price improvement refund",
      `Order FILLED @ ₹2795.00 (Limit ₹2800.00). Received ₹${expectedRefund} cash refund!`
    );

    // =================================================================
    // SCENARIO 8: Pending SELL reaches limit - Executes automatically
    // =================================================================
    console.log("\n--- Scenario 8: Pending SELL Reaches Limit ---");
    // We have a pending limit sell order (from Scenario 6) with limitPrice 3100.00, qty 1.
    // Now market price rises to 3120.00 (>= 3100.00).
    const preCash8 = (await getOrCreateUserFunds(TEST_USER)).availableCash;
    const preHoldQty8 = (await HoldingsModel.findOne({ userId: TEST_USER, name: "RELIANCE" })).qty;

    await tickerService.updateQuote("RELIANCE", 3120.00);
    const matchSellResults = await matchPendingOrdersForStock("RELIANCE", 3120.00);

    const postOrder8 = await OrdersModel.findById(pendLimitSell.order._id);
    const postFunds8 = await getOrCreateUserFunds(TEST_USER);
    const postHold8 = await HoldingsModel.findOne({ userId: TEST_USER, name: "RELIANCE" });
    const expectedProceeds = 3120.00;

    assert(
      matchSellResults.length >= 1 &&
      postOrder8.status === "FILLED" &&
      postOrder8.executionPrice === 3120.00 &&
      postHold8.qty === preHoldQty8 - 1 &&
      postHold8.lockedQty === 0 &&
      Number((postFunds8.availableCash - preCash8).toFixed(2)) === expectedProceeds,
      "Scenario 8: Pending SELL reaches limit and executes with market proceeds credited",
      `Order FILLED @ ₹3120.00. Proceeds ₹${expectedProceeds} added to availableCash!`
    );

    // =================================================================
    // SCENARIO 9: User cancels pending order - Order remains cancelled
    // =================================================================
    console.log("\n--- Scenario 9: User Cancels Pending Order ---");
    // Place a pending Limit Buy for testing cancellation
    const cancelTestOrder = await processOrder({
      userId: TEST_USER,
      name: "TCS",
      qty: 2,
      orderType: "LIMIT",
      limitPrice: 3500.00, // Market is ~3950
      mode: "BUY",
      product: "CNC",
    });
    const preCashCancel = (await getOrCreateUserFunds(TEST_USER)).availableCash;

    const cancelRes = await cancelOrder(cancelTestOrder.order._id, TEST_USER);
    const postCashCancel = (await getOrCreateUserFunds(TEST_USER)).availableCash;
    const postCancelledOrder = await OrdersModel.findById(cancelTestOrder.order._id);

    assert(
      cancelRes.success &&
      postCancelledOrder.status === "CANCELLED" &&
      Number((postCashCancel - preCashCancel).toFixed(2)) === 7000.00, // 2 * 3500 reserved funds refunded
      "Scenario 9: User cancels pending order; status is CANCELLED and reserved funds are restored",
      `Order status: ${postCancelledOrder.status}, Refunded: ₹7000.00`
    );

    // =================================================================
    // SCENARIO 10: Insufficient balance - Order rejected
    // =================================================================
    console.log("\n--- Scenario 10: Insufficient Balance ---");
    // Try to place Limit Buy requiring ₹2,80,000 when user has only ~₹90,000
    const rejBalRes = await processOrder({
      userId: TEST_USER,
      name: "RELIANCE",
      qty: 100,
      orderType: "LIMIT",
      limitPrice: 2800.00, // Below market (2890.50), requires ₹2,80,000 margin reserve
      mode: "BUY",
      product: "CNC",
    });
    assert(
      rejBalRes.success === false &&
      rejBalRes.status === "REJECTED" &&
      rejBalRes.rejectionReason &&
      rejBalRes.rejectionReason.includes("Insufficient virtual funds"),
      "Scenario 10: Insufficient balance order is REJECTED without modifying ledger",
      `Reason: ${rejBalRes.rejectionReason}`
    );

    // =================================================================
    // SCENARIO 11: Insufficient holdings - Order rejected
    // =================================================================
    console.log("\n--- Scenario 11: Insufficient Holdings ---");
    // Try to place Limit Sell for 100 shares of INFY when user owns 0
    const rejHoldRes = await processOrder({
      userId: TEST_USER,
      name: "INFY",
      qty: 100,
      orderType: "LIMIT",
      limitPrice: 1600.00,
      mode: "SELL",
      product: "CNC",
    });
    assert(
      rejHoldRes.success === false &&
      rejHoldRes.status === "REJECTED" &&
      rejHoldRes.rejectionReason.includes("Insufficient holdings to sell"),
      "Scenario 11: Insufficient holdings order is REJECTED",
      `Reason: ${rejHoldRes.rejectionReason}`
    );

    // =================================================================
    // SCENARIO 12: Same order matched twice - Only one execution
    // =================================================================
    console.log("\n--- Scenario 12: Same Order Matched Twice ---");
    // Place a pending Limit Buy order
    const doubleMatchTest = await processOrder({
      userId: TEST_USER,
      name: "TCS",
      qty: 1,
      orderType: "LIMIT",
      limitPrice: 3600.00,
      mode: "BUY",
      product: "CNC",
    });
    const orderIdToMatch = doubleMatchTest.order._id;

    // First execution attempt
    const exec1 = await executeMatchingOrder(orderIdToMatch, 3580.00);
    // Second execution attempt on the SAME order
    const exec2 = await executeMatchingOrder(orderIdToMatch, 3580.00);

    assert(
      exec1.success === true &&
      exec2.success === false &&
      exec2.reason === "ORDER_NOT_PENDING",
      "Scenario 12: Same order matched twice executes only once (second attempt rejected)",
      `Exec 1: ${exec1.success}, Exec 2: ${exec2.success} (${exec2.reason})`
    );

    // =================================================================
    // SCENARIO 13: Two concurrent execution attempts - No duplicate financial updates
    // =================================================================
    console.log("\n--- Scenario 13: Concurrent Execution Attempts ---");
    // Place a pending Limit Buy order
    const concurrentOrder = await processOrder({
      userId: TEST_USER,
      name: "INFY",
      qty: 2,
      orderType: "LIMIT",
      limitPrice: 1500.00,
      mode: "BUY",
      product: "CNC",
    });
    const concurrentOrderId = concurrentOrder.order._id;

    // Run two executeMatchingOrder calls concurrently in parallel
    const [concurrentRes1, concurrentRes2] = await Promise.all([
      executeMatchingOrder(concurrentOrderId, 1490.00),
      executeMatchingOrder(concurrentOrderId, 1490.00),
    ]);

    const successfulAttempts = [concurrentRes1, concurrentRes2].filter(r => r.success).length;
    const failedAttempts = [concurrentRes1, concurrentRes2].filter(r => !r.success).length;

    // Verify holding has exactly 2 shares (not 4 shares from duplicate execution!)
    const infyHolding = await HoldingsModel.findOne({ userId: TEST_USER, name: "INFY" });

    assert(
      successfulAttempts === 1 &&
      failedAttempts === 1 &&
      infyHolding && infyHolding.qty === 2,
      "Scenario 13: Two concurrent execution attempts yield exactly ONE execution without duplicate updates",
      `Successes: ${successfulAttempts}, Failures: ${failedAttempts}, Holding Qty: ${infyHolding?.qty}`
    );

    // =================================================================
    // CLEANUP
    // =================================================================
    console.log("\n--- Cleaning up test user records ---");
    await OrdersModel.deleteMany({ userId: TEST_USER });
    await HoldingsModel.deleteMany({ userId: TEST_USER });
    await PositionsModel.deleteMany({ userId: TEST_USER });
    await FundsModel.deleteMany({ userId: TEST_USER });
    console.log(" Cleaned up test artifacts.\n");

  } finally {
    await mongoose.disconnect();
    console.log(" Disconnected from MongoDB Atlas.");
  }

  console.log("==================================================================");
  console.log(` TEST SUMMARY: ${passed} PASSED / ${failed} FAILED (Total: ${passed + failed})`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test Suite Unhandled Exception:", err);
  process.exit(1);
});
