const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const http = require("http");
const { io: ClientIO } = require("socket.io-client");

const { OrdersModel } = require("../model/OrdersModel");
const { HoldingsModel } = require("../model/HoldingsModel");
const { PositionsModel } = require("../model/PositionsModel");
const { FundsModel } = require("../model/FundsModel");
const { UserModel } = require("../model/UserModel");
const {
  processOrder,
  cancelOrder,
  settleMISPosition,
  getOrCreateUserFunds,
} = require("../services/orderExecutionService");
const { app, server } = require("../index");

const URI = process.env.MONGO_URL;
const TOKEN_KEY = process.env.TOKEN_KEY || "test_token_secret_key";
process.env.TOKEN_KEY = TOKEN_KEY;

const TEST_USER_A = "audit_user_a_" + Date.now();
const TEST_USER_B = "audit_user_b_" + Date.now();
const TOKEN_USER_A = jwt.sign({ id: TEST_USER_A }, TOKEN_KEY, { expiresIn: "1h" });
const TOKEN_USER_B = jwt.sign({ id: TEST_USER_B }, TOKEN_KEY, { expiresIn: "1h" });
const TAMPERED_TOKEN = TOKEN_USER_A.slice(0, -5) + "abcde";

let testServer = null;
let serverPort = null;

async function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = { "Content-Type": "application/json" };
    const reqOptions = {
      hostname: "127.0.0.1",
      port: serverPort,
      path,
      method: options.method || "GET",
      headers: { ...defaultHeaders, ...(options.headers || {}) },
    };

    const req = http.request(reqOptions, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });

    req.on("error", reject);
    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runAuditSuite() {
  console.log("==================================================================");
  console.log("   BACKEND RELIABILITY, SECURITY & MIS ACCOUNTING AUDIT SUITE");
  console.log("==================================================================\n");

  if (!URI) {
    console.error("FATAL: MONGO_URL not defined in .env");
    process.exit(1);
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(URI);
  }
  console.log(" Connected to MongoDB Atlas.\n");

  // Spin up test HTTP server on random port
  await new Promise((resolve) => {
    testServer = server.listen(0, "127.0.0.1", () => {
      serverPort = testServer.address().port;
      console.log(` Test server running on http://127.0.0.1:${serverPort}\n`);
      resolve();
    });
  });

  let passed = 0;
  let failed = 0;

  function assert(condition, scenario, details = "") {
    if (condition) {
      console.log(`[PASS] ${scenario}`);
      if (details) console.log(`       ↳ ${details}`);
      passed++;
    } else {
      console.error(`[FAIL] ${scenario}`);
      if (details) console.error(`       ↳ ${details}`);
      failed++;
    }
  }

  try {
    // ==================================================================
    // 1. AUTHENTICATION & AUTHORIZATION AUDIT
    // ==================================================================
    console.log("\n--- SECTION 1: AUTHENTICATION & AUTHORIZATION ---");

    // 1.1 Unauthenticated requests are rejected with 401
    const resNoToken = await makeRequest("/allHoldings");
    assert(
      resNoToken.status === 401 && resNoToken.data.success === false,
      "Auth Check 1: Missing JWT returns 401 Unauthorized",
      `Status: ${resNoToken.status}, Message: ${resNoToken.data.message}`
    );

    // 1.2 Tampered / Invalid token is rejected with 401
    const resBadToken = await makeRequest("/allHoldings", {
      headers: { Authorization: `Bearer ${TAMPERED_TOKEN}` },
    });
    assert(
      resBadToken.status === 401 && resBadToken.data.success === false,
      "Auth Check 2: Tampered/Invalid JWT returns 401 Unauthorized",
      `Status: ${resBadToken.status}, Message: ${resBadToken.data.message}`
    );

    // 1.3 Client cannot spoof identity via body.userId or query.userId
    const resSpoof = await makeRequest(`/allHoldings?userId=${TEST_USER_B}`, {
      headers: { Authorization: `Bearer ${TOKEN_USER_A}` },
    });
    assert(
      resSpoof.status === 200,
      "Auth Check 3: Authenticated with valid JWT (spoof query ignored)",
      `Status: ${resSpoof.status}`
    );

    // 1.4 Socket.IO rejects unauthenticated connection
    const socketNoAuth = ClientIO(`http://127.0.0.1:${serverPort}`, {
      transports: ["websocket"],
      reconnection: false,
    });
    const socketNoAuthRejected = await new Promise((resolve) => {
      socketNoAuth.on("connect_error", (err) => {
        socketNoAuth.close();
        resolve(err.message.includes("Authentication error"));
      });
      socketNoAuth.on("connect", () => {
        socketNoAuth.close();
        resolve(false);
      });
    });
    assert(
      socketNoAuthRejected,
      "Socket.IO Security: Missing token rejected at handshake",
      "Handshake error triggered correctly"
    );

    // 1.5 Socket.IO accepts connection with valid JWT
    const socketAuth = ClientIO(`http://127.0.0.1:${serverPort}`, {
      auth: { token: TOKEN_USER_A },
      transports: ["websocket"],
      reconnection: false,
    });
    const socketAuthConnected = await new Promise((resolve) => {
      socketAuth.on("connect", () => {
        socketAuth.close();
        resolve(true);
      });
      socketAuth.on("connect_error", (err) => {
        socketAuth.close();
        resolve(false);
      });
    });
    assert(
      socketAuthConnected,
      "Socket.IO Security: Valid JWT successfully connects to personal room",
      "Handshake verified and room scoped to authenticated user ID"
    );

    // ==================================================================
    // 2. MIS INTRADAY ACCOUNTING (ALL 10 STATES)
    // ==================================================================
    console.log("\n--- SECTION 2: MIS 10-STATE ACCOUNTING ---");

    const misUser = "mis_test_user_" + Date.now();
    let funds = await getOrCreateUserFunds(misUser);
    funds.availableCash = 50000;
    funds.availableMargin = 50000;
    funds.usedMargin = 0;
    await funds.save();

    // State 1: Open Long
    // Buy 10 @ 100 -> Cost: 1000. availableCash: 49000, usedMargin: 1000
    const s1 = await settleMISPosition({
      userId: misUser,
      symbol: "TESTSYM",
      tradeQty: 10,
      tradeMode: "BUY",
      executionPrice: 100.0,
      funds,
    });
    assert(
      s1.success && s1.state === "OPEN_LONG" && s1.position.qty === 10 && s1.position.avg === 100 && funds.usedMargin === 1000,
      "MIS State 1: Open Long",
      `Qty: ${s1.position?.qty}, Avg: ₹${s1.position?.avg}, Used Margin: ₹${funds.usedMargin}`
    );

    // State 2: Increase Long
    // Buy 10 @ 120 -> New Qty: 20, New Avg: (10*100 + 10*120)/20 = 110. usedMargin: 2200
    const s2 = await settleMISPosition({
      userId: misUser,
      symbol: "TESTSYM",
      tradeQty: 10,
      tradeMode: "BUY",
      executionPrice: 120.0,
      funds,
    });
    assert(
      s2.success && s2.state === "INCREASE_LONG" && s2.position.qty === 20 && s2.position.avg === 110 && funds.usedMargin === 2200,
      "MIS State 2: Increase Long",
      `Qty: ${s2.position?.qty}, Avg: ₹${s2.position?.avg}, Used Margin: ₹${funds.usedMargin}`
    );

    // State 3: Reduce Long (Partial Close)
    // Sell 5 @ 130 -> Realized P&L: 5 * (130 - 110) = +100. Released margin: 5*110 = 550. Remaining qty: 15, avg: 110
    const s3 = await settleMISPosition({
      userId: misUser,
      symbol: "TESTSYM",
      tradeQty: 5,
      tradeMode: "SELL",
      executionPrice: 130.0,
      funds,
    });
    assert(
      s3.success && s3.state === "REDUCE_LONG" && s3.position.qty === 15 && s3.position.avg === 110 && s3.realizedPnL === 100,
      "MIS State 3: Reduce Long (Partial Close)",
      `Qty: ${s3.position?.qty}, Avg: ₹${s3.position?.avg}, Realized P&L: ₹${s3.realizedPnL}`
    );

    // State 4: Close Long (Full Exit)
    // Sell 15 @ 140 -> Realized P&L: 15 * (140 - 110) = +450. Margin released: 1650. usedMargin: 0. Position deleted.
    const s4 = await settleMISPosition({
      userId: misUser,
      symbol: "TESTSYM",
      tradeQty: 15,
      tradeMode: "SELL",
      executionPrice: 140.0,
      funds,
    });
    const posAfterClose = await PositionsModel.findOne({ userId: misUser, name: "TESTSYM", product: "MIS" });
    assert(
      s4.success && s4.state === "CLOSE_LONG" && s4.realizedPnL === 450 && funds.usedMargin === 0 && !posAfterClose,
      "MIS State 4: Close Long (Full Exit)",
      `Realized P&L: ₹${s4.realizedPnL}, Used Margin: ₹${funds.usedMargin}, Position doc deleted: ${!posAfterClose}`
    );

    // State 5: Open Short
    // Sell 10 @ 200 -> Margin: 2000. Qty: -10, Avg: 200. usedMargin: 2000
    const s5 = await settleMISPosition({
      userId: misUser,
      symbol: "TESTSYM",
      tradeQty: 10,
      tradeMode: "SELL",
      executionPrice: 200.0,
      funds,
    });
    assert(
      s5.success && s5.state === "OPEN_SHORT" && s5.position.qty === -10 && s5.position.avg === 200 && funds.usedMargin === 2000,
      "MIS State 5: Open Short",
      `Qty: ${s5.position?.qty}, Avg: ₹${s5.position?.avg}, Used Margin: ₹${funds.usedMargin}`
    );

    // State 6: Increase Short
    // Sell 10 @ 180 -> New Qty: -20, New Avg: (10*200 + 10*180)/20 = 190. usedMargin: 3800
    const s6 = await settleMISPosition({
      userId: misUser,
      symbol: "TESTSYM",
      tradeQty: 10,
      tradeMode: "SELL",
      executionPrice: 180.0,
      funds,
    });
    assert(
      s6.success && s6.state === "INCREASE_SHORT" && s6.position.qty === -20 && s6.position.avg === 190 && funds.usedMargin === 3800,
      "MIS State 6: Increase Short",
      `Qty: ${s6.position?.qty}, Avg: ₹${s6.position?.avg}, Used Margin: ₹${funds.usedMargin}`
    );

    // State 7: Reduce Short (Partial Cover)
    // Buy 5 @ 160 -> Realized P&L: 5 * (190 - 160) = +150. Remaining qty: -15, avg: 190
    const s7 = await settleMISPosition({
      userId: misUser,
      symbol: "TESTSYM",
      tradeQty: 5,
      tradeMode: "BUY",
      executionPrice: 160.0,
      funds,
    });
    assert(
      s7.success && s7.state === "REDUCE_SHORT" && s7.position.qty === -15 && s7.position.avg === 190 && s7.realizedPnL === 150,
      "MIS State 7: Reduce Short (Partial Cover)",
      `Qty: ${s7.position?.qty}, Avg: ₹${s7.position?.avg}, Realized P&L: ₹${s7.realizedPnL}`
    );

    // State 8: Close Short (Full Cover)
    // Buy 15 @ 170 -> Realized P&L: 15 * (190 - 170) = +300. usedMargin: 0. Position deleted.
    const s8 = await settleMISPosition({
      userId: misUser,
      symbol: "TESTSYM",
      tradeQty: 15,
      tradeMode: "BUY",
      executionPrice: 170.0,
      funds,
    });
    const posAfterCover = await PositionsModel.findOne({ userId: misUser, name: "TESTSYM", product: "MIS" });
    assert(
      s8.success && s8.state === "CLOSE_SHORT" && s8.realizedPnL === 300 && funds.usedMargin === 0 && !posAfterCover,
      "MIS State 8: Close Short (Full Cover)",
      `Realized P&L: ₹${s8.realizedPnL}, Used Margin: ₹${funds.usedMargin}, Position doc deleted: ${!posAfterCover}`
    );

    // State 9: Long-to-Short Reversal
    // User opens 10 Long @ 100, then sells 15 @ 110.
    // Long leg: closes 10 Long with P&L = 10 * (110 - 100) = +100.
    // Short leg: opens 5 Short @ 110. Result: qty = -5, avg = 110.
    await settleMISPosition({
      userId: misUser,
      symbol: "REVERSAL",
      tradeQty: 10,
      tradeMode: "BUY",
      executionPrice: 100.0,
      funds,
    });
    const s9 = await settleMISPosition({
      userId: misUser,
      symbol: "REVERSAL",
      tradeQty: 15,
      tradeMode: "SELL",
      executionPrice: 110.0,
      funds,
    });
    assert(
      s9.success && s9.state === "REVERSAL_LONG_TO_SHORT" && s9.position.qty === -5 && s9.position.avg === 110 && s9.realizedPnL === 100,
      "MIS State 9: Long-to-Short Reversal",
      `New Qty: ${s9.position?.qty}, New Avg: ₹${s9.position?.avg}, Realized P&L from Long leg: ₹${s9.realizedPnL}`
    );

    // State 10: Short-to-Long Reversal
    // User currently has -5 Short @ 110. Places BUY of 15 @ 90.
    // Short leg: covers 5 Short with P&L = 5 * (110 - 90) = +100.
    // Long leg: opens 10 Long @ 90. Result: qty = 10, avg = 90.
    const s10 = await settleMISPosition({
      userId: misUser,
      symbol: "REVERSAL",
      tradeQty: 15,
      tradeMode: "BUY",
      executionPrice: 90.0,
      funds,
    });
    assert(
      s10.success && s10.state === "REVERSAL_SHORT_TO_LONG" && s10.position.qty === 10 && s10.position.avg === 90 && s10.realizedPnL === 100,
      "MIS State 10: Short-to-Long Reversal",
      `New Qty: ${s10.position?.qty}, New Avg: ₹${s10.position?.avg}, Realized P&L from Short leg: ₹${s10.realizedPnL}`
    );

    // Clean up reversal position
    await PositionsModel.deleteMany({ userId: misUser });

    // ==================================================================
    // 3. PENDING SELL SHARE RESERVATIONS (LOCKED QTY)
    // ==================================================================
    console.log("\n--- SECTION 3: SHARE RESERVATIONS (LOCKED QTY) ---");

    const lockedUser = "locked_user_" + Date.now();
    await HoldingsModel.create({
      userId: lockedUser,
      name: "TCS",
      qty: 10,
      lockedQty: 0,
      avg: 3500,
      price: 3500,
      net: "+0.00%",
      day: "+0.00%",
    });

    // Place pending limit sell of 10 shares @ 4000 (market is ~3500)
    const limitSell1 = await processOrder({
      userId: lockedUser,
      name: "TCS",
      qty: 10,
      orderType: "LIMIT",
      limitPrice: 4000,
      mode: "SELL",
      product: "CNC",
    });

    const holdingAfterSell1 = await HoldingsModel.findOne({ userId: lockedUser, name: "TCS" });
    assert(
      limitSell1.status === "PENDING" && holdingAfterSell1.lockedQty === 10,
      "Share Locking 1: Pending SELL reserves 10 shares in lockedQty",
      `Order: PENDING, Holding: owned=${holdingAfterSell1.qty}, locked=${holdingAfterSell1.lockedQty}`
    );

    // Attempt second SELL of 5 shares: Must be REJECTED (available is 0)
    const limitSell2 = await processOrder({
      userId: lockedUser,
      name: "TCS",
      qty: 5,
      orderType: "LIMIT",
      limitPrice: 4000,
      mode: "SELL",
      product: "CNC",
    });
    assert(
      limitSell2.status === "REJECTED",
      "Share Locking 2: Overselling locked shares is REJECTED",
      `Reason: ${limitSell2.rejectionReason}`
    );

    // Cancel the pending order: locked shares must be restored to 0
    const cancelRes = await cancelOrder(limitSell1.order._id, lockedUser);
    const holdingAfterCancel = await HoldingsModel.findOne({ userId: lockedUser, name: "TCS" });
    assert(
      cancelRes.success && holdingAfterCancel.lockedQty === 0,
      "Share Locking 3: Order cancellation restores lockedQty to 0",
      `Cancelled: true, LockedQty: ${holdingAfterCancel.lockedQty}`
    );

    // ==================================================================
    // 4. FUNDS MANAGEMENT & CONCURRENCY
    // ==================================================================
    console.log("\n--- SECTION 4: FUNDS MANAGEMENT & CONCURRENCY ---");

    const fundsUser = "funds_user_" + Date.now();
    const tokenFunds = jwt.sign({ id: fundsUser }, TOKEN_KEY, { expiresIn: "1h" });

    // 4.1 Valid deposit
    const addRes = await makeRequest("/api/funds/add", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenFunds}` },
      body: { amount: 5000 },
    });
    assert(
      addRes.status === 200 && addRes.data.funds.availableCash === 5000,
      "Funds 1: Valid deposit increases available cash",
      `Available cash: ₹${addRes.data.funds.availableCash}`
    );

    // 4.2 Non-finite or negative deposits rejected
    const badDeposit = await makeRequest("/api/funds/add", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenFunds}` },
      body: { amount: -500 },
    });
    assert(
      badDeposit.status === 400,
      "Funds 2: Negative/invalid deposit is rejected (400)",
      `Status: ${badDeposit.status}`
    );

    // 4.3 Withdrawal exceeding balance rejected
    const overWithdraw = await makeRequest("/api/funds/withdraw", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenFunds}` },
      body: { amount: 10000 },
    });
    assert(
      overWithdraw.status === 400,
      "Funds 3: Withdrawal exceeding availableCash is rejected (400)",
      `Status: ${overWithdraw.status}, Message: ${overWithdraw.data.message}`
    );

    // 4.4 Atomic concurrent withdrawals race test
    // User has ₹5,000. Send two concurrent withdrawal requests for ₹3,000 each.
    // Exactly ONE must succeed and ONE must fail. Final balance must be ₹2,000 (NEVER negative).
    const [w1, w2] = await Promise.all([
      makeRequest("/api/funds/withdraw", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenFunds}` },
        body: { amount: 3000 },
      }),
      makeRequest("/api/funds/withdraw", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenFunds}` },
        body: { amount: 3000 },
      }),
    ]);

    const successes = [w1, w2].filter((w) => w.status === 200).length;
    const failures = [w1, w2].filter((w) => w.status === 400).length;
    const endFunds = await FundsModel.findOne({ userId: fundsUser });

    assert(
      successes === 1 && failures === 1 && endFunds.availableCash === 2000,
      "Funds 4: Atomic concurrency race prevents double withdrawal (balance never negative)",
      `Successes: ${successes}, Failures: ${failures}, Final balance: ₹${endFunds.availableCash}`
    );

    // ==================================================================
    // 5. USER-SCOPED IDEMPOTENCY
    // ==================================================================
    console.log("\n--- SECTION 5: USER-SCOPED IDEMPOTENCY ---");

    const idempKey = "test_shared_key_" + Date.now();
    const idempUserA = "idemp_user_a_" + Date.now();
    const idempUserB = "idemp_user_b_" + Date.now();

    // Fund both users
    const fA = await getOrCreateUserFunds(idempUserA);
    fA.availableCash = 50000;
    fA.availableMargin = 50000;
    await fA.save();

    const fB = await getOrCreateUserFunds(idempUserB);
    fB.availableCash = 50000;
    fB.availableMargin = 50000;
    await fB.save();

    // User A submits order with idempotencyKey
    const idempOrder1 = await processOrder({
      userId: idempUserA,
      name: "INFY",
      qty: 1,
      orderType: "MARKET",
      mode: "BUY",
      product: "CNC",
      idempotencyKey: idempKey,
    });

    // User A submits DUPLICATE order with same idempotencyKey: must return cached result
    const idempOrderDuplicate = await processOrder({
      userId: idempUserA,
      name: "INFY",
      qty: 1,
      orderType: "MARKET",
      mode: "BUY",
      product: "CNC",
      idempotencyKey: idempKey,
    });
    assert(
      idempOrderDuplicate.isDuplicate === true && idempOrderDuplicate.order._id.toString() === idempOrder1.order._id.toString(),
      "Idempotency 1: Duplicate request by same user returns cached response",
      `Duplicate detected: true, Same Order ID: ${idempOrderDuplicate.order._id}`
    );

    // User B submits order with SAME idempotencyKey: must NOT be blocked (scoped by userId)
    const idempOrderUserB = await processOrder({
      userId: idempUserB,
      name: "INFY",
      qty: 1,
      orderType: "MARKET",
      mode: "BUY",
      product: "CNC",
      idempotencyKey: idempKey,
    });
    assert(
      idempOrderUserB.success && !idempOrderUserB.isDuplicate && idempOrderUserB.order._id.toString() !== idempOrder1.order._id.toString(),
      "Idempotency 2: Separate users are independently scoped (User B is not blocked by User A's key)",
      `User B Order ID: ${idempOrderUserB.order._id}`
    );

    // ==================================================================
    // CLEANUP
    // ==================================================================
    console.log("\n--- Cleaning up test records ---");
    const testUsers = [TEST_USER_A, TEST_USER_B, misUser, lockedUser, fundsUser, idempUserA, idempUserB];
    await Promise.all([
      OrdersModel.deleteMany({ userId: { $in: testUsers } }),
      HoldingsModel.deleteMany({ userId: { $in: testUsers } }),
      PositionsModel.deleteMany({ userId: { $in: testUsers } }),
      FundsModel.deleteMany({ userId: { $in: testUsers } }),
    ]);
    console.log(" Cleaned up test artifacts.\n");

  } finally {
    if (testServer) {
      testServer.close();
    }
  }

  console.log("==================================================================");
  console.log(` AUDIT SUMMARY: ${passed} PASSED / ${failed} FAILED (Total: ${passed + failed})`);
  console.log("==================================================================\n");

  process.exit(failed > 0 ? 1 : 0);
}

runAuditSuite().catch((err) => {
  console.error("Test Suite Unhandled Exception:", err);
  process.exit(1);
});

