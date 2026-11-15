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

const { WalletTransactionModel } = require("../model/WalletTransactionModel");
const { PaymentModel } = require("../model/PaymentModel");
const { FundsModel } = require("../model/FundsModel");
const paymentRoutes = require("../routes/paymentRoutes");
const { getUserTransactionHistory } = require("../services/paymentService");

async function runTransactionHistoryTestSuite() {
  console.log("================================================================");
  console.log("   WALLET TRANSACTION HISTORY & LEDGER INTEGRATION TEST SUITE   ");
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
  await WalletTransactionModel.syncIndexes();

  // 2. Setup Test Server
  const app = express();
  app.use(cookieParser());
  app.use(bodyParser.json());

  // Mount payment routes
  app.use("/api/payments", paymentRoutes);

  // Mount funds endpoints
  app.get("/api/funds/transactions", async (req, res) => {
    const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
    try {
      const decoded = jwt.verify(token, process.env.TOKEN_KEY);
      const history = await getUserTransactionHistory({
        userId: String(decoded.id),
        page: req.query.page,
        limit: req.query.limit,
        type: req.query.type,
      });
      return res.json(history);
    } catch (e) {
      return res.status(401).json({ success: false, message: "Invalid session" });
    }
  });

  app.post("/api/funds/add", async (req, res) => {
    const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
    const decoded = jwt.verify(token, process.env.TOKEN_KEY);
    const userId = String(decoded.id);
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "Invalid amount" });

    const funds = await FundsModel.findOneAndUpdate(
      { userId },
      { $inc: { availableCash: amount, availableMargin: amount, payin: amount } },
      { new: true, upsert: true }
    );

    const paymentId = `UPI_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    await WalletTransactionModel.create({
      userId,
      paymentId,
      type: "DEPOSIT",
      amount: Math.round(amount * 100),
      amountPaise: Math.round(amount * 100),
      amountRupees: amount,
      currency: "INR",
      balanceBefore: funds.availableMargin - amount,
      balanceAfter: funds.availableMargin,
      status: "COMPLETED",
      description: `Simulated UPI Deposit (${paymentId})`,
      timestamp: new Date(),
    });

    return res.json({ success: true, funds });
  });

  app.post("/api/funds/withdraw", async (req, res) => {
    const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
    const decoded = jwt.verify(token, process.env.TOKEN_KEY);
    const userId = String(decoded.id);
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "Invalid amount" });

    const funds = await FundsModel.findOneAndUpdate(
      { userId },
      { $inc: { availableCash: -amount, availableMargin: -amount } },
      { new: true }
    );

    const paymentId = `WTH_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    await WalletTransactionModel.create({
      userId,
      paymentId,
      type: "WITHDRAWAL",
      amount: Math.round(amount * 100),
      amountPaise: Math.round(amount * 100),
      amountRupees: amount,
      currency: "INR",
      balanceBefore: funds.availableMargin + amount,
      balanceAfter: funds.availableMargin,
      status: "COMPLETED",
      description: `Simulated Bank Withdrawal (${paymentId})`,
      timestamp: new Date(),
    });

    return res.json({ success: true, funds });
  });

  const server = http.createServer(app);
  const port = 59620;
  await new Promise((resolve) => server.listen(port, resolve));
  const baseUrl = `http://localhost:${port}`;
  console.log(`--> Test Server listening at ${baseUrl}\n`);

  // Generate test users and tokens
  const aliceId = `alice_${Date.now()}`;
  const bobId = `bob_${Date.now()}`;
  const charlieId = `charlie_${Date.now()}`;

  const tokenAlice = jwt.sign({ id: aliceId }, process.env.TOKEN_KEY, { expiresIn: "1h" });
  const tokenBob = jwt.sign({ id: bobId }, process.env.TOKEN_KEY, { expiresIn: "1h" });
  const tokenCharlie = jwt.sign({ id: charlieId }, process.env.TOKEN_KEY, { expiresIn: "1h" });

  const headersAlice = { Authorization: `Bearer ${tokenAlice}` };
  const headersBob = { Authorization: `Bearer ${tokenBob}` };
  const headersCharlie = { Authorization: `Bearer ${tokenCharlie}` };

  // Seed transactions for Alice (5 transactions: 3 deposits, 2 withdrawals)
  const now = Date.now();
  await WalletTransactionModel.create([
    {
      userId: aliceId,
      paymentId: `PAY_ALICE_1_${now}`,
      razorpayPaymentId: `pay_rzp_1_${now}`,
      razorpayOrderId: `order_rzp_1_${now}`,
      type: "DEPOSIT",
      amount: 500000,
      amountPaise: 500000,
      amountRupees: 5000,
      balanceBefore: 10000,
      balanceAfter: 15000,
      status: "COMPLETED",
      description: "Wallet deposit via Razorpay",
      createdAt: new Date(now - 40000),
    },
    {
      userId: aliceId,
      paymentId: `UPI_ALICE_2_${now}`,
      type: "DEPOSIT",
      amount: 200000,
      amountPaise: 200000,
      amountRupees: 2000,
      balanceBefore: 15000,
      balanceAfter: 17000,
      status: "COMPLETED",
      description: "Simulated UPI Deposit",
      createdAt: new Date(now - 30000),
    },
    {
      userId: aliceId,
      paymentId: `WTH_ALICE_3_${now}`,
      type: "WITHDRAWAL",
      amount: 150000,
      amountPaise: 150000,
      amountRupees: 1500,
      balanceBefore: 17000,
      balanceAfter: 15500,
      status: "COMPLETED",
      description: "Simulated Bank Withdrawal",
      createdAt: new Date(now - 20000),
    },
    {
      userId: aliceId,
      paymentId: `PAY_ALICE_4_${now}`,
      razorpayPaymentId: `pay_rzp_4_${now}`,
      razorpayOrderId: `order_rzp_4_${now}`,
      type: "DEPOSIT",
      amount: 1000000,
      amountPaise: 1000000,
      amountRupees: 10000,
      balanceBefore: 15500,
      balanceAfter: 25500,
      status: "COMPLETED",
      description: "Wallet deposit via Razorpay",
      createdAt: new Date(now - 10000),
    },
    {
      userId: aliceId,
      paymentId: `WTH_ALICE_5_${now}`,
      type: "WITHDRAWAL",
      amount: 250000,
      amountPaise: 250000,
      amountRupees: 2500,
      balanceBefore: 25500,
      balanceAfter: 23000,
      status: "COMPLETED",
      description: "Simulated Bank Withdrawal",
      createdAt: new Date(now),
    },
  ]);

  // Seed transactions for Bob (2 transactions)
  await WalletTransactionModel.create([
    {
      userId: bobId,
      paymentId: `PAY_BOB_1_${now}`,
      razorpayPaymentId: `pay_rzp_bob_1_${now}`,
      razorpayOrderId: `order_rzp_bob_1_${now}`,
      type: "DEPOSIT",
      amount: 700000,
      amountPaise: 700000,
      amountRupees: 7000,
      balanceBefore: 5000,
      balanceAfter: 12000,
      status: "COMPLETED",
      description: "Wallet deposit via Razorpay",
      createdAt: new Date(now - 5000),
    },
    {
      userId: bobId,
      paymentId: `WTH_BOB_2_${now}`,
      type: "WITHDRAWAL",
      amount: 300000,
      amountPaise: 300000,
      amountRupees: 3000,
      balanceBefore: 12000,
      balanceAfter: 9000,
      status: "COMPLETED",
      description: "Simulated Bank Withdrawal",
      createdAt: new Date(now),
    },
  ]);

  // -------------------------------------------------------------
  // TEST 1: Authentication Enforcement
  // -------------------------------------------------------------
  console.log("--- 1. Authentication Enforcement ---");
  try {
    await axios.get(`${baseUrl}/api/payments/transactions`);
    assert(false, "1a. Request without token should return 401");
  } catch (err) {
    assert(err.response?.status === 401, "1a. Request without token rejected with HTTP 401");
  }

  try {
    await axios.get(`${baseUrl}/api/payments/transactions`, {
      headers: { Authorization: "Bearer forged_or_invalid_jwt_token" },
    });
    assert(false, "1b. Request with invalid token should return 401");
  } catch (err) {
    assert(err.response?.status === 401, "1b. Request with invalid token rejected with HTTP 401");
  }

  // -------------------------------------------------------------
  // TEST 2: Ownership Isolation
  // -------------------------------------------------------------
  console.log("\n--- 2. User Ownership Isolation ---");
  const resAlice = await axios.get(`${baseUrl}/api/payments/transactions`, { headers: headersAlice });
  assert(resAlice.status === 200, "2a. Alice successfully retrieves transactions (HTTP 200)");
  assert(resAlice.data.pagination.totalRecords === 5, "2b. Alice sees exactly her 5 transactions");
  const aliceCrossCheck = resAlice.data.data.every((t) => !t.paymentId.includes("BOB"));
  assert(aliceCrossCheck, "2c. Zero transactions belonging to Bob appear in Alice's ledger");

  const resBob = await axios.get(`${baseUrl}/api/payments/transactions`, { headers: headersBob });
  assert(resBob.status === 200, "2d. Bob successfully retrieves transactions (HTTP 200)");
  assert(resBob.data.pagination.totalRecords === 2, "2e. Bob sees exactly his 2 transactions");
  const bobCrossCheck = resBob.data.data.every((t) => !t.paymentId.includes("ALICE"));
  assert(bobCrossCheck, "2f. Zero transactions belonging to Alice appear in Bob's ledger");

  // -------------------------------------------------------------
  // TEST 3: Empty History for User With No Transactions
  // -------------------------------------------------------------
  console.log("\n--- 3. Empty History Handling ---");
  const resCharlie = await axios.get(`${baseUrl}/api/payments/transactions`, { headers: headersCharlie });
  assert(resCharlie.status === 200, "3a. User Charlie retrieves empty history cleanly (HTTP 200)");
  assert(resCharlie.data.pagination.totalRecords === 0, "3b. totalRecords is 0 for user without activity");
  assert(Array.isArray(resCharlie.data.data) && resCharlie.data.data.length === 0, "3c. Empty data array returned");
  assert(resCharlie.data.pagination.totalPages === 1, "3d. totalPages is 1 for empty history");
  assert(resCharlie.data.pagination.hasNextPage === false, "3e. hasNextPage is false");
  assert(resCharlie.data.pagination.hasPrevPage === false, "3f. hasPrevPage is false");

  // -------------------------------------------------------------
  // TEST 4: Sorting (Strictly Newest First)
  // -------------------------------------------------------------
  console.log("\n--- 4. Sorting (Newest First) ---");
  const resSorted = await axios.get(`${baseUrl}/api/payments/transactions`, { headers: headersAlice });
  const records = resSorted.data.data;
  let isSortedDescending = true;
  for (let i = 0; i < records.length - 1; i++) {
    const tCurrent = new Date(records[i].createdAt).getTime();
    const tNext = new Date(records[i + 1].createdAt).getTime();
    if (tCurrent < tNext) {
      isSortedDescending = false;
      break;
    }
  }
  assert(isSortedDescending, "4a. Transactions strictly sorted newest first (descending createdAt)");
  assert(records[0].paymentId === `WTH_ALICE_5_${now}`, "4b. Most recent transaction is at index 0");
  assert(records[records.length - 1].paymentId === `PAY_ALICE_1_${now}`, "4c. Oldest transaction is at last index");

  // -------------------------------------------------------------
  // TEST 5: Pagination (limit & page)
  // -------------------------------------------------------------
  console.log("\n--- 5. Pagination Mechanics ---");
  // Page 1 with limit 2
  const p1 = await axios.get(`${baseUrl}/api/payments/transactions?page=1&limit=2`, { headers: headersAlice });
  assert(p1.data.data.length === 2, "5a. Page 1 returns exactly 2 items");
  assert(p1.data.pagination.page === 1, "5b. Page 1 reflected in pagination object");
  assert(p1.data.pagination.limit === 2, "5c. Limit 2 reflected in pagination object");
  assert(p1.data.pagination.totalPages === 3, "5d. Total pages is 3 for 5 records with limit 2");
  assert(p1.data.pagination.hasNextPage === true, "5e. Page 1 hasNextPage is true");
  assert(p1.data.pagination.hasPrevPage === false, "5f. Page 1 hasPrevPage is false");

  // Page 2 with limit 2
  const p2 = await axios.get(`${baseUrl}/api/payments/transactions?page=2&limit=2`, { headers: headersAlice });
  assert(p2.data.data.length === 2, "5g. Page 2 returns exactly 2 items");
  assert(p2.data.pagination.page === 2, "5h. Page 2 reflected in pagination object");
  assert(p2.data.pagination.hasNextPage === true, "5i. Page 2 hasNextPage is true");
  assert(p2.data.pagination.hasPrevPage === true, "5j. Page 2 hasPrevPage is true");
  assert(p1.data.data[0].paymentId !== p2.data.data[0].paymentId, "5k. Page 2 data does not overlap Page 1 data");

  // Page 3 with limit 2 (Final Page)
  const p3 = await axios.get(`${baseUrl}/api/payments/transactions?page=3&limit=2`, { headers: headersAlice });
  assert(p3.data.data.length === 1, "5l. Page 3 returns remaining 1 item");
  assert(p3.data.pagination.hasNextPage === false, "5m. Page 3 hasNextPage is false");
  assert(p3.data.pagination.hasPrevPage === true, "5n. Page 3 hasPrevPage is true");

  // -------------------------------------------------------------
  // TEST 6: Invalid and Boundary Pagination Parameters
  // -------------------------------------------------------------
  console.log("\n--- 6. Invalid & Boundary Pagination Parameters ---");
  // Negative page
  const resNegPage = await axios.get(`${baseUrl}/api/payments/transactions?page=-5`, { headers: headersAlice });
  assert(resNegPage.data.pagination.page === 1, "6a. Negative page gracefully defaults to page 1");

  // Non-numeric page
  const resStrPage = await axios.get(`${baseUrl}/api/payments/transactions?page=abc`, { headers: headersAlice });
  assert(resStrPage.data.pagination.page === 1, "6b. Non-numeric page gracefully defaults to page 1");

  // Excessive limit (> 50)
  const resBigLimit = await axios.get(`${baseUrl}/api/payments/transactions?limit=500`, { headers: headersAlice });
  assert(resBigLimit.data.pagination.limit === 50, "6c. Excessive limit bounded to 50 max to prevent DoS");

  // Beyond total pages
  const resOverPage = await axios.get(`${baseUrl}/api/payments/transactions?page=999`, { headers: headersAlice });
  assert(resOverPage.data.data.length === 0, "6d. Out-of-bounds page returns empty data array without 500 error");
  assert(resOverPage.data.pagination.hasNextPage === false, "6e. Out-of-bounds page hasNextPage is false");

  // -------------------------------------------------------------
  // TEST 7: Type Filtering (DEPOSIT vs WITHDRAWAL)
  // -------------------------------------------------------------
  console.log("\n--- 7. Mixed Transaction Types & Filtering ---");
  // Filter DEPOSIT
  const resDeposits = await axios.get(`${baseUrl}/api/payments/transactions?type=DEPOSIT`, { headers: headersAlice });
  assert(resDeposits.data.pagination.totalRecords === 3, "7a. Deposit filter returns exactly 3 deposits");
  assert(resDeposits.data.data.every((t) => t.type === "DEPOSIT"), "7b. All returned records have type DEPOSIT");

  // Filter WITHDRAWAL
  const resWithdrawals = await axios.get(`${baseUrl}/api/payments/transactions?type=WITHDRAWAL`, { headers: headersAlice });
  assert(resWithdrawals.data.pagination.totalRecords === 2, "7c. Withdrawal filter returns exactly 2 withdrawals");
  assert(resWithdrawals.data.data.every((t) => t.type === "WITHDRAWAL"), "7d. All returned records have type WITHDRAWAL");

  // -------------------------------------------------------------
  // TEST 8: Required Ledger Fields Presence
  // -------------------------------------------------------------
  console.log("\n--- 8. Required Ledger Fields Presence ---");
  const sampleTx = resDeposits.data.data.find((t) => t.razorpayPaymentId);
  assert(sampleTx !== undefined, "8a. Found sample Razorpay transaction");
  assert(sampleTx.transactionId.startsWith("PAY_"), "8b. transactionId populated");
  assert(sampleTx.razorpayPaymentId.startsWith("pay_rzp_"), "8c. razorpayPaymentId populated");
  assert(sampleTx.razorpayOrderId.startsWith("order_rzp_"), "8d. razorpayOrderId populated");
  assert(sampleTx.amountRupees === 10000 || sampleTx.amountRupees === 5000, "8e. amountRupees populated accurately");
  assert(sampleTx.amountPaise > 0, "8f. amountPaise populated accurately");
  assert(sampleTx.balanceBefore !== undefined, "8g. balanceBefore populated");
  assert(sampleTx.balanceAfter !== undefined, "8h. balanceAfter populated");
  assert(sampleTx.status === "COMPLETED", "8i. status is COMPLETED");
  assert(sampleTx.createdAt !== undefined, "8j. createdAt date populated");
  assert(sampleTx.description !== undefined, "8k. description populated");

  // -------------------------------------------------------------
  // TEST 9: Simulated UPI and Withdrawal Auto-Ledger Integration
  // -------------------------------------------------------------
  console.log("\n--- 9. Simulated UPI & Withdrawal Auto-Ledger Recording ---");
  const testSimUserId = `user_sim_${Date.now()}`;
  const testSimToken = jwt.sign({ id: testSimUserId }, process.env.TOKEN_KEY, { expiresIn: "1h" });
  const headersSim = { Authorization: `Bearer ${testSimToken}` };

  // Step A: Simulated UPI deposit
  const upiRes = await axios.post(`${baseUrl}/api/funds/add`, { amount: 4500 }, { headers: headersSim });
  assert(upiRes.status === 200, "9a. Simulated UPI deposit returns HTTP 200");

  const ledgerAfterUpi = await axios.get(`${baseUrl}/api/payments/transactions`, { headers: headersSim });
  assert(ledgerAfterUpi.data.pagination.totalRecords === 1, "9b. Simulated UPI deposit created exactly 1 ledger record");
  assert(ledgerAfterUpi.data.data[0].amountRupees === 4500, "9c. Ledger amountRupees matches UPI deposit (₹4,500)");
  assert(ledgerAfterUpi.data.data[0].type === "DEPOSIT", "9d. Ledger type is DEPOSIT");

  // Step B: Simulated withdrawal
  const withdrawRes = await axios.post(`${baseUrl}/api/funds/withdraw`, { amount: 1500 }, { headers: headersSim });
  assert(withdrawRes.status === 200, "9e. Simulated withdrawal returns HTTP 200");

  const ledgerAfterWithdraw = await axios.get(`${baseUrl}/api/payments/transactions`, { headers: headersSim });
  assert(ledgerAfterWithdraw.data.pagination.totalRecords === 2, "9f. Total ledger records is now 2");
  assert(ledgerAfterWithdraw.data.data[0].type === "WITHDRAWAL", "9g. Most recent transaction is WITHDRAWAL");
  assert(ledgerAfterWithdraw.data.data[0].amountRupees === 1500, "9h. Withdrawal amount is ₹1,500");
  assert(ledgerAfterWithdraw.data.data[0].balanceAfter === 3000, "9i. balanceAfter accurately reflects ₹3,000");

  // -------------------------------------------------------------
  // TEST 10: GET /api/funds/transactions Compatibility
  // -------------------------------------------------------------
  console.log("\n--- 10. Secondary Endpoint Route Compatibility ---");
  const resFundsRoute = await axios.get(`${baseUrl}/api/funds/transactions`, { headers: headersSim });
  assert(resFundsRoute.status === 200, "10a. GET /api/funds/transactions returns HTTP 200");
  assert(resFundsRoute.data.pagination.totalRecords === 2, "10b. Returns identical 2 records as /api/payments/transactions");

  // -------------------------------------------------------------
  // TEST 11: Read-Only Ledger Immutability via HTTP
  // -------------------------------------------------------------
  console.log("\n--- 11. Read-Only Ledger Immutability via HTTP ---");
  try {
    await axios.delete(`${baseUrl}/api/payments/transactions`, { headers: headersAlice });
    assert(false, "11a. DELETE should not be supported");
  } catch (err) {
    assert(err.response?.status === 404, "11a. DELETE /api/payments/transactions rejected (HTTP 404)");
  }

  try {
    await axios.put(`${baseUrl}/api/payments/transactions`, {}, { headers: headersAlice });
    assert(false, "11b. PUT should not be supported");
  } catch (err) {
    assert(err.response?.status === 404, "11b. PUT /api/payments/transactions rejected (HTTP 404)");
  }

  // -------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------
  await WalletTransactionModel.deleteMany({ userId: { $in: [aliceId, bobId, charlieId, testSimUserId] } });
  await FundsModel.deleteMany({ userId: testSimUserId });

  await new Promise((r) => server.close(r));
  await mongoose.disconnect();

  console.log("\n================================================================");
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTransactionHistoryTestSuite().catch((err) => {
  console.error("Test Suite Unhandled Rejection:", err);
  process.exit(1);
});

