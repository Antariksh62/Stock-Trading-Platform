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
const paymentRoutes = require("../routes/paymentRoutes");
const { razorpayClient, getRazorpayCredentials } = require("../config/razorpay");

async function runTestSuite() {
  console.log("================================================================");
  console.log("    RAZORPAY PAYMENT ORDER CREATION ENDPOINT TEST SUITE         ");
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
    await PaymentModel.syncIndexes();
  } catch (syncErr) {
    await PaymentModel.init();
  }
  console.log("--> MongoDB Atlas Connected and PaymentModel indexes synchronized.\n");

  // 2. Set up ephemeral Express test app
  const app = express();
  app.use(cookieParser());
  app.use(bodyParser.json());
  app.use("/api/payments", paymentRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/payments`;
  console.log(`--> Ephemeral Test Server running on port ${port} (${baseUrl})\n`);

  const testUserId = `test_user_${Date.now()}`;
  const validToken = jwt.sign({ id: testUserId }, process.env.TOKEN_KEY || "secret_key", {
    expiresIn: "1h",
  });
  const authHeaders = {
    Authorization: `Bearer ${validToken}`,
  };

  const { keySecret } = getRazorpayCredentials();

  try {
    // -------------------------------------------------------------
    // TEST 1: Successful Order Creation with Valid Payload
    // -------------------------------------------------------------
    console.log("--- 1. Order Creation with Valid Payload (₹5,000) ---");
    const depositAmountRupees = 5000;
    const res1 = await axios.post(
      `${baseUrl}/create-order`,
      { amount: depositAmountRupees, notes: { testCase: "valid_order" } },
      { headers: authHeaders }
    );

    assert(res1.status === 201, "HTTP 201 Created returned for valid deposit");
    assert(res1.data.success === true, "Response success is true");
    assert(res1.data.isDuplicate === false, "isDuplicate is false for new order");
    assert(
      typeof res1.data.orderId === "string" && res1.data.orderId.startsWith("order_"),
      `Razorpay order ID returned starting with 'order_' (${res1.data.orderId})`
    );
    assert(
      typeof res1.data.internalPaymentId === "string" &&
        res1.data.internalPaymentId.startsWith("PAY_"),
      `Internal payment ID generated starting with 'PAY_' (${res1.data.internalPaymentId})`
    );
    assert(
      res1.data.amount === 500000 && Number.isInteger(res1.data.amount),
      "Amount correctly converted to integer paise (500000 paise for ₹5,000)"
    );
    assert(res1.data.amountRupees === 5000, "amountRupees correctly echoes ₹5,000");
    assert(res1.data.currency === "INR", "Currency is INR");
    assert(res1.data.status === "CREATED", "Status is CREATED");
    assert(
      typeof res1.data.keyId === "string" && res1.data.keyId.startsWith("rzp_test_"),
      `Public Test Key ID returned (${res1.data.keyId})`
    );

    // Verify DB record
    const dbRecord1 = await PaymentModel.findOne({
      internalPaymentId: res1.data.internalPaymentId,
    });
    assert(dbRecord1 !== null, "Payment record successfully persisted in MongoDB");
    assert(
      dbRecord1?.razorpayOrderId === res1.data.orderId,
      "MongoDB record associates razorpayOrderId correctly"
    );
    assert(
      dbRecord1?.amount === 500000,
      "MongoDB record stores amount as integer paise (500000)"
    );
    assert(dbRecord1?.status === "CREATED", "MongoDB record status is CREATED");
    assert(dbRecord1?.userId === testUserId, "MongoDB record scoped to authenticated user");

    // -------------------------------------------------------------
    // TEST 2: Rejection of Unauthenticated Requests
    // -------------------------------------------------------------
    console.log("\n--- 2. Unauthenticated Requests Rejection ---");
    let unauthMissingTokenPassed = false;
    try {
      await axios.post(`${baseUrl}/create-order`, { amount: 500 });
    } catch (err) {
      unauthMissingTokenPassed = err.response?.status === 401;
    }
    assert(unauthMissingTokenPassed, "Requests without token rejected with HTTP 401");

    let unauthInvalidTokenPassed = false;
    try {
      await axios.post(
        `${baseUrl}/create-order`,
        { amount: 500 },
        { headers: { Authorization: "Bearer forged_fake_token_12345" } }
      );
    } catch (err) {
      unauthInvalidTokenPassed = err.response?.status === 401;
    }
    assert(unauthInvalidTokenPassed, "Requests with invalid/forged token rejected with HTTP 401");

    let spoofedUserIdPassed = false;
    try {
      await axios.post(
        `${baseUrl}/create-order`,
        { amount: 500, userId: "admin_user_spoof" }
      );
    } catch (err) {
      spoofedUserIdPassed = err.response?.status === 401;
    }
    assert(
      spoofedUserIdPassed,
      "Requests attempting to spoof userId without token rejected with HTTP 401"
    );

    // -------------------------------------------------------------
    // TEST 3: Rejection of Invalid, Zero, or Negative Amounts
    // -------------------------------------------------------------
    console.log("\n--- 3. Validation of Invalid Amounts ---");

    const invalidAmounts = [
      { val: 0, reason: "Zero amount" },
      { val: -500, reason: "Negative amount" },
      { val: 49.99, reason: "Decimal/floating-point amount" },
      { val: 50, reason: "Below minimum ₹100 limit" },
      { val: 200000, reason: "Above maximum ₹100,000 limit" },
      { val: "not_a_number", reason: "Non-numeric string" },
      { val: undefined, reason: "Missing amount" },
    ];

    for (const item of invalidAmounts) {
      let rejected = false;
      try {
        await axios.post(
          `${baseUrl}/create-order`,
          { amount: item.val },
          { headers: authHeaders }
        );
      } catch (err) {
        rejected = err.response?.status === 400;
      }
      assert(rejected, `Amount rejection: ${item.reason} (${item.val}) -> HTTP 400`);
    }

    // -------------------------------------------------------------
    // TEST 4: Correct Conversion from INR to Integer Paise
    // -------------------------------------------------------------
    console.log("\n--- 4. Conversion from INR to Integer Paise ---");
    const testCases = [
      { inr: 100, expectedPaise: 10000 },
      { inr: 2500, expectedPaise: 250000 },
      { inr: 100000, expectedPaise: 10000000 },
    ];

    for (const tc of testCases) {
      const res = await axios.post(
        `${baseUrl}/create-order`,
        { amount: tc.inr },
        { headers: authHeaders }
      );
      assert(
        res.data.amount === tc.expectedPaise && Number.isInteger(res.data.amount),
        `₹${tc.inr} accurately converted to ${tc.expectedPaise} integer paise`
      );
    }

    // -------------------------------------------------------------
    // TEST 5: Idempotency Handling for Repeated Requests
    // -------------------------------------------------------------
    console.log("\n--- 5. Idempotent Order Creation ---");
    const idemKey = `idem_${Date.now()}_test`;

    // 1st request with idempotencyKey
    const idemRes1 = await axios.post(
      `${baseUrl}/create-order`,
      { amount: 1200, idempotencyKey: idemKey },
      { headers: authHeaders }
    );
    assert(idemRes1.status === 201, "First idempotent request created order (HTTP 201)");
    assert(idemRes1.data.isDuplicate === false, "First request marked isDuplicate: false");
    const originalInternalId = idemRes1.data.internalPaymentId;
    const originalOrderId = idemRes1.data.orderId;

    // 2nd request with exact same idempotencyKey
    const idemRes2 = await axios.post(
      `${baseUrl}/create-order`,
      { amount: 1200, idempotencyKey: idemKey },
      { headers: authHeaders }
    );
    assert(
      idemRes2.status === 200,
      "Duplicate idempotent request returns existing order (HTTP 200)"
    );
    assert(idemRes2.data.isDuplicate === true, "Duplicate request marked isDuplicate: true");
    assert(
      idemRes2.data.internalPaymentId === originalInternalId,
      "Duplicate request returns identical internalPaymentId"
    );
    assert(
      idemRes2.data.orderId === originalOrderId,
      "Duplicate request returns identical razorpayOrderId"
    );

    // Verify DB count for this idempotencyKey
    const idemDbCount = await PaymentModel.countDocuments({
      userId: testUserId,
      idempotencyKey: idemKey,
    });
    assert(
      idemDbCount === 1,
      `Exactly 1 Payment record exists in DB for idempotency key '${idemKey}' (No duplicates)`
    );

    // -------------------------------------------------------------
    // TEST 6: Gateway Error Handling (Simulated Failure)
    // -------------------------------------------------------------
    console.log("\n--- 6. Gateway API Failure Handling (502/503) ---");
    // Temporarily mock razorpayClient.orders.create to throw a network error
    const originalCreate = razorpayClient.orders.create;
    razorpayClient.orders.create = async () => {
      const err = new Error("Gateway connection timed out");
      err.statusCode = 502;
      throw err;
    };

    let gatewayErrorStatus = 0;
    let gatewayErrorMessage = "";
    try {
      await axios.post(
        `${baseUrl}/create-order`,
        { amount: 2000 },
        { headers: authHeaders }
      );
    } catch (err) {
      gatewayErrorStatus = err.response?.status;
      gatewayErrorMessage = err.response?.data?.message || "";
    } finally {
      // Restore original create method
      razorpayClient.orders.create = originalCreate;
    }

    assert(
      gatewayErrorStatus === 502,
      `Gateway failure correctly translated to HTTP 502 Bad Gateway (${gatewayErrorStatus})`
    );
    assert(
      gatewayErrorMessage.includes("timed out") || gatewayErrorMessage.includes("Failed"),
      `Gateway error returns user-friendly explanation: "${gatewayErrorMessage}"`
    );

    // -------------------------------------------------------------
    // TEST 7: Zero Secret Leakage Verification
    // -------------------------------------------------------------
    console.log("\n--- 7. Zero Secret Leakage Verification ---");
    const jsonStr = JSON.stringify({
      res1: res1.data,
      idem1: idemRes1.data,
      idem2: idemRes2.data,
    });

    const leaksSecret = keySecret && jsonStr.includes(keySecret);
    const leaksMongo = jsonStr.includes(mongoUri);
    const leaksToken = jsonStr.includes(validToken);

    assert(!leaksSecret, "RAZORPAY_TEST_KEY_SECRET is NOT leaked in any response payload");
    assert(!leaksMongo, "Database connection strings are NOT leaked in responses");
    assert(!leaksToken, "JWT secrets are NOT leaked in responses");

  } catch (unexpectedErr) {
    console.error("Unexpected test failure:", unexpectedErr);
    failed++;
  } finally {
    // Clean up test documents
    console.log("\n--> Cleaning up test records for user:", testUserId);
    await PaymentModel.deleteMany({ userId: testUserId });

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

runTestSuite();
