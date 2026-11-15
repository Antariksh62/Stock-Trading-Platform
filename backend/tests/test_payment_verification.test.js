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
const paymentRoutes = require("../routes/paymentRoutes");
const { razorpayClient, getRazorpayCredentials } = require("../config/razorpay");

async function runVerificationTestSuite() {
  console.log("================================================================");
  console.log("    RAZORPAY PAYMENT VERIFICATION ENDPOINT TEST SUITE           ");
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
    await PaymentModel.syncIndexes();
  } catch (e) {
    await PaymentModel.init();
  }
  console.log("--> MongoDB Atlas Connected and PaymentModel synced.\n");

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

  // Credentials & Tokens
  const { keySecret } = getRazorpayCredentials();
  const tokenSecret = process.env.TOKEN_KEY || "secret_key";

  const userA = `user_alice_${Date.now()}`;
  const tokenA = jwt.sign({ id: userA }, tokenSecret, { expiresIn: "1h" });
  const authA = { Authorization: `Bearer ${tokenA}` };

  const userB = `user_bob_${Date.now()}`;
  const tokenB = jwt.sign({ id: userB }, tokenSecret, { expiresIn: "1h" });
  const authB = { Authorization: `Bearer ${tokenB}` };

  // Helper to generate valid Razorpay checkout HMAC-SHA256 signature
  const makeSignature = (orderId, paymentId, secret = keySecret) => {
    return crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
  };

  // Keep all response bodies to test for secret leakage
  const allResponsePayloads = [];

  // Backup original razorpayClient.payments.fetch
  const originalFetch = razorpayClient?.payments?.fetch;

  try {
    // -------------------------------------------------------------
    // SETUP: Seed test orders in MongoDB
    // -------------------------------------------------------------
    const seedOrder = async ({ orderId, internalId, amount = 500000, status = "CREATED", userId = userA, currency = "INR" }) => {
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

    // -------------------------------------------------------------
    // TEST 1: Valid Signature with Captured Payment
    // -------------------------------------------------------------
    console.log("--- 1. Valid Signature with Captured Payment ---");
    const order1 = `order_test_t1_${Date.now()}`;
    const pay1 = `pay_test_t1_${Date.now()}`;
    await seedOrder({ orderId: order1, internalId: `PAY_T1_${Date.now()}`, amount: 500000 });

    razorpayClient.payments.fetch = async (id) => ({
      id,
      order_id: order1,
      amount: 500000,
      currency: "INR",
      status: "captured",
      captured: true,
      method: "upi",
    });

    const sig1 = makeSignature(order1, pay1);
    const res1 = await axios.post(
      `${baseUrl}/verify`,
      {
        razorpay_order_id: order1,
        razorpay_payment_id: pay1,
        razorpay_signature: sig1,
      },
      { headers: authA }
    );
    allResponsePayloads.push(res1.data);

    assert(res1.status === 200, "Valid signature & captured payment returns HTTP 200");
    assert(res1.data.success === true, "Response success is true");
    assert(
      res1.data.status === "CAPTURED" || res1.data.status === "CREDITED",
      `Status in response is CAPTURED or CREDITED (${res1.data.status})`
    );
    assert(res1.data.razorpayPaymentId === pay1, "razorpayPaymentId echoed correctly");
    assert(res1.data.razorpayOrderId === order1, "razorpayOrderId echoed correctly");

    const db1 = await PaymentModel.findOne({ razorpayOrderId: order1 });
    assert(
      db1.status === "CAPTURED" || db1.status === "CREDITED",
      `DB record updated to CAPTURED or CREDITED (${db1.status})`
    );
    assert(db1.razorpayPaymentId === pay1, "DB record stores razorpayPaymentId");
    assert(db1.razorpaySignature === sig1, "DB record stores razorpaySignature");
    assert(db1.capturedAt !== null, "DB record populates capturedAt timestamp");

    // -------------------------------------------------------------
    // TEST 2: Invalid Signature
    // -------------------------------------------------------------
    console.log("\n--- 2. Invalid Signature ---");
    const order2 = `order_test_t2_${Date.now()}`;
    const pay2 = `pay_test_t2_${Date.now()}`;
    await seedOrder({ orderId: order2, internalId: `PAY_T2_${Date.now()}`, amount: 250000 });

    const bogusSig = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 64-char invalid hex
    let invalidSigStatus = 0;
    let invalidSigMsg = "";
    try {
      await axios.post(
        `${baseUrl}/verify`,
        {
          razorpay_order_id: order2,
          razorpay_payment_id: pay2,
          razorpay_signature: bogusSig,
        },
        { headers: authA }
      );
    } catch (err) {
      invalidSigStatus = err.response?.status;
      invalidSigMsg = err.response?.data?.message || "";
      allResponsePayloads.push(err.response?.data);
    }

    assert(invalidSigStatus === 400, "Invalid signature returns HTTP 400");
    assert(invalidSigMsg.includes("Invalid payment signature"), "User-friendly signature failure message");
    const db2 = await PaymentModel.findOne({ razorpayOrderId: order2 });
    assert(db2.status === "CREATED", "DB record remains in CREATED state on invalid signature");

    // -------------------------------------------------------------
    // TEST 3: Missing Signature
    // -------------------------------------------------------------
    console.log("\n--- 3. Missing Signature / Fields ---");
    let missingSigStatus = 0;
    try {
      await axios.post(
        `${baseUrl}/verify`,
        {
          razorpay_order_id: order2,
          razorpay_payment_id: pay2,
        },
        { headers: authA }
      );
    } catch (err) {
      missingSigStatus = err.response?.status;
      allResponsePayloads.push(err.response?.data);
    }
    assert(missingSigStatus === 400, "Missing signature field returns HTTP 400");

    // -------------------------------------------------------------
    // TEST 4: Tampered Payment ID
    // -------------------------------------------------------------
    console.log("\n--- 4. Tampered Payment ID ---");
    const order4 = `order_test_t4_${Date.now()}`;
    const pay4Expected = `pay_expected_${Date.now()}`;
    const pay4Tampered = `pay_tampered_${Date.now()}`;
    await seedOrder({ orderId: order4, internalId: `PAY_T4_${Date.now()}` });

    // Gateway fetch returns payment that actually belongs to another order
    razorpayClient.payments.fetch = async (id) => ({
      id,
      order_id: "order_different_victim_123",
      amount: 500000,
      currency: "INR",
      status: "captured",
      captured: true,
    });

    const sig4 = makeSignature(order4, pay4Tampered);
    let tamperedStatus = 0;
    let tamperedMsg = "";
    try {
      await axios.post(
        `${baseUrl}/verify`,
        {
          razorpay_order_id: order4,
          razorpay_payment_id: pay4Tampered,
          razorpay_signature: sig4,
        },
        { headers: authA }
      );
    } catch (err) {
      tamperedStatus = err.response?.status;
      tamperedMsg = err.response?.data?.message || "";
      allResponsePayloads.push(err.response?.data);
    }
    assert(tamperedStatus === 400, "Tampered payment ID returns HTTP 400");
    assert(tamperedMsg.includes("does not belong to the specified order"), "Tampered order linkage caught");

    // -------------------------------------------------------------
    // TEST 5: Wrong Order ID (Non-existent Order)
    // -------------------------------------------------------------
    console.log("\n--- 5. Wrong / Non-existent Order ID ---");
    let nonExistentStatus = 0;
    try {
      await axios.post(
        `${baseUrl}/verify`,
        {
          razorpay_order_id: "order_ghost_does_not_exist",
          razorpay_payment_id: "pay_whatever_123",
          razorpay_signature: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
        { headers: authA }
      );
    } catch (err) {
      nonExistentStatus = err.response?.status;
      allResponsePayloads.push(err.response?.data);
    }
    assert(nonExistentStatus === 404, "Unknown order returns HTTP 404 Not Found");

    // -------------------------------------------------------------
    // TEST 6: User Attempting to Verify Another User's Payment
    // -------------------------------------------------------------
    console.log("\n--- 6. Ownership Check (User B verifying User A's order) ---");
    const order6 = `order_test_t6_${Date.now()}`;
    const pay6 = `pay_test_t6_${Date.now()}`;
    await seedOrder({ orderId: order6, internalId: `PAY_T6_${Date.now()}`, userId: userA });

    const sig6 = makeSignature(order6, pay6);
    let crossUserStatus = 0;
    let crossUserMsg = "";
    try {
      await axios.post(
        `${baseUrl}/verify`,
        {
          razorpay_order_id: order6,
          razorpay_payment_id: pay6,
          razorpay_signature: sig6,
        },
        { headers: authB } // Bob trying to verify Alice's order
      );
    } catch (err) {
      crossUserStatus = err.response?.status;
      crossUserMsg = err.response?.data?.message || "";
      allResponsePayloads.push(err.response?.data);
    }
    assert(crossUserStatus === 403, "Cross-user verification rejected with HTTP 403 Forbidden");
    assert(crossUserMsg.includes("another user"), "Error explains ownership violation");

    // -------------------------------------------------------------
    // TEST 7: Amount Mismatch
    // -------------------------------------------------------------
    console.log("\n--- 7. Amount Mismatch ---");
    const order7 = `order_test_t7_${Date.now()}`;
    const pay7 = `pay_test_t7_${Date.now()}`;
    await seedOrder({ orderId: order7, internalId: `PAY_T7_${Date.now()}`, amount: 500000 }); // ₹5000 expected

    razorpayClient.payments.fetch = async (id) => ({
      id,
      order_id: order7,
      amount: 100000, // Gateway says only ₹1000 paid!
      currency: "INR",
      status: "captured",
      captured: true,
    });

    const sig7 = makeSignature(order7, pay7);
    let amountMismatchStatus = 0;
    try {
      await axios.post(
        `${baseUrl}/verify`,
        {
          razorpay_order_id: order7,
          razorpay_payment_id: pay7,
          razorpay_signature: sig7,
        },
        { headers: authA }
      );
    } catch (err) {
      amountMismatchStatus = err.response?.status;
      allResponsePayloads.push(err.response?.data);
    }
    assert(amountMismatchStatus === 400, "Amount mismatch returns HTTP 400");

    // -------------------------------------------------------------
    // TEST 8: Currency Mismatch
    // -------------------------------------------------------------
    console.log("\n--- 8. Currency Mismatch ---");
    const order8 = `order_test_t8_${Date.now()}`;
    const pay8 = `pay_test_t8_${Date.now()}`;
    await seedOrder({ orderId: order8, internalId: `PAY_T8_${Date.now()}`, amount: 500000 });

    razorpayClient.payments.fetch = async (id) => ({
      id,
      order_id: order8,
      amount: 500000,
      currency: "USD", // Gateway says USD instead of INR
      status: "captured",
      captured: true,
    });

    const sig8 = makeSignature(order8, pay8);
    let currencyMismatchStatus = 0;
    try {
      await axios.post(
        `${baseUrl}/verify`,
        {
          razorpay_order_id: order8,
          razorpay_payment_id: pay8,
          razorpay_signature: sig8,
        },
        { headers: authA }
      );
    } catch (err) {
      currencyMismatchStatus = err.response?.status;
      allResponsePayloads.push(err.response?.data);
    }
    assert(currencyMismatchStatus === 400, "Currency mismatch returns HTTP 400");

    // -------------------------------------------------------------
    // TEST 9: Captured Payment Confirmation
    // -------------------------------------------------------------
    console.log("\n--- 9. Captured Payment Confirmation ---");
    const order9 = `order_test_t9_${Date.now()}`;
    const pay9 = `pay_test_t9_${Date.now()}`;
    await seedOrder({ orderId: order9, internalId: `PAY_T9_${Date.now()}`, amount: 300000 });

    razorpayClient.payments.fetch = async (id) => ({
      id,
      order_id: order9,
      amount: 300000,
      currency: "INR",
      status: "captured",
      captured: true,
      method: "netbanking",
    });

    const sig9 = makeSignature(order9, pay9);
    const res9 = await axios.post(
      `${baseUrl}/verify`,
      {
        razorpay_order_id: order9,
        razorpay_payment_id: pay9,
        razorpay_signature: sig9,
      },
      { headers: authA }
    );
    allResponsePayloads.push(res9.data);
    assert(
      res9.status === 200 &&
        (res9.data.status === "CAPTURED" || res9.data.status === "CREDITED"),
      "Payment marked CAPTURED or CREDITED on captured status"
    );

    // -------------------------------------------------------------
    // TEST 10: Authorized but Uncaptured Payment
    // -------------------------------------------------------------
    console.log("\n--- 10. Authorized but Uncaptured Payment ---");
    const order10 = `order_test_t10_${Date.now()}`;
    const pay10 = `pay_test_t10_${Date.now()}`;
    await seedOrder({ orderId: order10, internalId: `PAY_T10_${Date.now()}`, amount: 150000 });

    razorpayClient.payments.fetch = async (id) => ({
      id,
      order_id: order10,
      amount: 150000,
      currency: "INR",
      status: "authorized",
      captured: false, // Not captured yet!
      method: "card",
    });

    const sig10 = makeSignature(order10, pay10);
    const res10 = await axios.post(
      `${baseUrl}/verify`,
      {
        razorpay_order_id: order10,
        razorpay_payment_id: pay10,
        razorpay_signature: sig10,
      },
      { headers: authA }
    );
    allResponsePayloads.push(res10.data);
    assert(res10.status === 200, "Authorized response returns HTTP 200");
    assert(res10.data.status === "PENDING", "Status is PENDING when payment is only authorized");
    assert(res10.data.message.includes("awaiting capture"), "Message says awaiting capture confirmation");

    const db10 = await PaymentModel.findOne({ razorpayOrderId: order10 });
    assert(db10.status === "PENDING", "DB record status updated to PENDING (not CAPTURED, not CREDITED)");

    // -------------------------------------------------------------
    // TEST 11: Failed Payment
    // -------------------------------------------------------------
    console.log("\n--- 11. Failed Payment ---");
    const order11 = `order_test_t11_${Date.now()}`;
    const pay11 = `pay_test_t11_${Date.now()}`;
    await seedOrder({ orderId: order11, internalId: `PAY_T11_${Date.now()}`, amount: 100000 });

    razorpayClient.payments.fetch = async (id) => ({
      id,
      order_id: order11,
      amount: 100000,
      currency: "INR",
      status: "failed",
      captured: false,
      error_description: "Payment declined by issuing bank",
    });

    const sig11 = makeSignature(order11, pay11);
    let failedStatus = 0;
    let failedData = null;
    try {
      await axios.post(
        `${baseUrl}/verify`,
        {
          razorpay_order_id: order11,
          razorpay_payment_id: pay11,
          razorpay_signature: sig11,
        },
        { headers: authA }
      );
    } catch (err) {
      failedStatus = err.response?.status;
      failedData = err.response?.data;
      allResponsePayloads.push(failedData);
    }
    assert(failedStatus === 400, "Failed payment returns HTTP 400");
    assert(failedData?.status === "FAILED", "Response status is FAILED");
    assert(failedData?.message.includes("declined"), "Response conveys failure reason");

    const db11 = await PaymentModel.findOne({ razorpayOrderId: order11 });
    assert(db11.status === "FAILED", "DB record updated to FAILED");
    assert(db11.failureReason.includes("declined"), "DB stores failure reason");

    // -------------------------------------------------------------
    // TEST 12: Pending / Created State
    // -------------------------------------------------------------
    console.log("\n--- 12. Pending / Created State from Gateway ---");
    const order12 = `order_test_t12_${Date.now()}`;
    const pay12 = `pay_test_t12_${Date.now()}`;
    await seedOrder({ orderId: order12, internalId: `PAY_T12_${Date.now()}`, amount: 400000 });

    razorpayClient.payments.fetch = async (id) => ({
      id,
      order_id: order12,
      amount: 400000,
      currency: "INR",
      status: "created",
      captured: false,
    });

    const sig12 = makeSignature(order12, pay12);
    const res12 = await axios.post(
      `${baseUrl}/verify`,
      {
        razorpay_order_id: order12,
        razorpay_payment_id: pay12,
        razorpay_signature: sig12,
      },
      { headers: authA }
    );
    allResponsePayloads.push(res12.data);
    assert(res12.data.status === "PENDING", "Pending gateway state returns PENDING");

    // -------------------------------------------------------------
    // TEST 13: Repeated Verification Request (Idempotency)
    // -------------------------------------------------------------
    console.log("\n--- 13. Repeated Verification Request (Idempotency) ---");
    // Re-verify order 1 (which is already CAPTURED)
    const res13 = await axios.post(
      `${baseUrl}/verify`,
      {
        razorpay_order_id: order1,
        razorpay_payment_id: pay1,
        razorpay_signature: sig1,
      },
      { headers: authA }
    );
    allResponsePayloads.push(res13.data);
    assert(res13.status === 200, "Repeated verification returns HTTP 200");
    assert(
      res13.data.status === "CAPTURED" || res13.data.status === "CREDITED",
      `Repeated verification keeps status CAPTURED or CREDITED (${res13.data.status})`
    );
    assert(res13.data.message.includes("already"), "Notice indicates already verified");

    // -------------------------------------------------------------
    // TEST 14: Concurrent Verification Requests
    // -------------------------------------------------------------
    console.log("\n--- 14. Concurrent Verification Requests ---");
    const order14 = `order_test_t14_${Date.now()}`;
    const pay14 = `pay_test_t14_${Date.now()}`;
    await seedOrder({ orderId: order14, internalId: `PAY_T14_${Date.now()}`, amount: 600000 });

    razorpayClient.payments.fetch = async (id) => ({
      id,
      order_id: order14,
      amount: 600000,
      currency: "INR",
      status: "captured",
      captured: true,
    });

    const sig14 = makeSignature(order14, pay14);
    const [concurrentRes1, concurrentRes2] = await Promise.all([
      axios.post(
        `${baseUrl}/verify`,
        { razorpay_order_id: order14, razorpay_payment_id: pay14, razorpay_signature: sig14 },
        { headers: authA }
      ),
      axios.post(
        `${baseUrl}/verify`,
        { razorpay_order_id: order14, razorpay_payment_id: pay14, razorpay_signature: sig14 },
        { headers: authA }
      ),
    ]);
    allResponsePayloads.push(concurrentRes1.data, concurrentRes2.data);
    assert(concurrentRes1.status === 200 && concurrentRes2.status === 200, "Both concurrent verification calls succeeded (HTTP 200)");
    const db14Count = await PaymentModel.countDocuments({ razorpayOrderId: order14 });
    assert(db14Count === 1, "Exactly 1 record exists in DB under concurrent verification");

    // -------------------------------------------------------------
    // TEST 15: Razorpay API Timeout / 504 Failure
    // -------------------------------------------------------------
    console.log("\n--- 15. Razorpay API Timeout Handling ---");
    const order15 = `order_test_t15_${Date.now()}`;
    const pay15 = `pay_test_t15_${Date.now()}`;
    await seedOrder({ orderId: order15, internalId: `PAY_T15_${Date.now()}` });

    razorpayClient.payments.fetch = async () => {
      const err = new Error("Gateway connection timed out");
      err.code = "ECONNABORTED";
      err.statusCode = 504;
      throw err;
    };

    const sig15 = makeSignature(order15, pay15);
    let timeoutStatus = 0;
    let timeoutMsg = "";
    try {
      await axios.post(
        `${baseUrl}/verify`,
        { razorpay_order_id: order15, razorpay_payment_id: pay15, razorpay_signature: sig15 },
        { headers: authA }
      );
    } catch (err) {
      timeoutStatus = err.response?.status;
      timeoutMsg = err.response?.data?.message || "";
      allResponsePayloads.push(err.response?.data);
    }
    assert(timeoutStatus === 504, `Timeout returns HTTP 504 Gateway Timeout (${timeoutStatus})`);
    assert(timeoutMsg.includes("timed out") || timeoutMsg.includes("Failed"), "Safe user-friendly timeout message");

    // -------------------------------------------------------------
    // TEST 16: MongoDB Failure Handling
    // -------------------------------------------------------------
    console.log("\n--- 16. MongoDB Failure Handling ---");
    const order16 = `order_test_t16_${Date.now()}`;
    const pay16 = `pay_test_t16_${Date.now()}`;

    // Temporarily mock findOne to simulate a DB connection drop
    const originalFindOne = PaymentModel.findOne;
    PaymentModel.findOne = () => {
      throw new Error("MongoNetworkTimeout: Connection pool exhausted");
    };

    const sig16 = makeSignature(order16, pay16);
    let mongoErrorStatus = 0;
    let mongoErrorMsg = "";
    try {
      await axios.post(
        `${baseUrl}/verify`,
        { razorpay_order_id: order16, razorpay_payment_id: pay16, razorpay_signature: sig16 },
        { headers: authA }
      );
    } catch (err) {
      mongoErrorStatus = err.response?.status;
      mongoErrorMsg = err.response?.data?.message || "";
      allResponsePayloads.push(err.response?.data);
    } finally {
      PaymentModel.findOne = originalFindOne;
    }
    assert(mongoErrorStatus === 500, "Database failure returns HTTP 500 Internal Server Error");
    assert(
      !mongoErrorMsg.includes("MongoNetworkTimeout") && !mongoErrorMsg.includes("mongodb://"),
      "Database internals and stack traces are NOT leaked in response"
    );

    // -------------------------------------------------------------
    // TEST 17: Already Credited Payment Immutability
    // -------------------------------------------------------------
    console.log("\n--- 17. Already Credited Payment Immutability ---");
    const order17 = `order_test_t17_${Date.now()}`;
    const pay17 = `pay_test_t17_${Date.now()}`;
    await seedOrder({
      orderId: order17,
      internalId: `PAY_T17_${Date.now()}`,
      status: "CREDITED",
      amount: 800000,
    });
    // Set razorpayPaymentId in DB
    await PaymentModel.updateOne({ razorpayOrderId: order17 }, { $set: { razorpayPaymentId: pay17 } });

    // Simulate late failed event from Razorpay
    razorpayClient.payments.fetch = async (id) => ({
      id,
      order_id: order17,
      amount: 800000,
      currency: "INR",
      status: "failed", // late failed notification
      captured: false,
    });

    const sig17 = makeSignature(order17, pay17);
    const res17 = await axios.post(
      `${baseUrl}/verify`,
      { razorpay_order_id: order17, razorpay_payment_id: pay17, razorpay_signature: sig17 },
      { headers: authA }
    );
    allResponsePayloads.push(res17.data);
    assert(res17.status === 200, "Already credited verification returns HTTP 200");
    assert(res17.data.status === "CREDITED", "Response status is preserved as CREDITED");

    const db17 = await PaymentModel.findOne({ razorpayOrderId: order17 });
    assert(db17.status === "CREDITED", "CREDITED payment was NOT demoted to FAILED or PENDING");

    // -------------------------------------------------------------
    // TEST 18: Secret Leakage Prevention
    // -------------------------------------------------------------
    console.log("\n--- 18. Secret Leakage Prevention ---");
    const combinedResponses = JSON.stringify(allResponsePayloads);

    const leaksKeySecret = keySecret && combinedResponses.includes(keySecret);
    const leaksTokenSecret = tokenSecret && combinedResponses.includes(tokenSecret);
    const leaksMongoUri = mongoUri && combinedResponses.includes(mongoUri);

    assert(!leaksKeySecret, "Razorpay Key Secret is NEVER leaked in any verification response");
    assert(!leaksTokenSecret, "JWT Secret is NEVER leaked in any verification response");
    assert(!leaksMongoUri, "MongoDB URI / credentials are NEVER leaked in any verification response");

  } catch (unexpectedErr) {
    console.error("Unexpected test failure:", unexpectedErr);
    failed++;
  } finally {
    // Restore fetch
    if (originalFetch) {
      razorpayClient.payments.fetch = originalFetch;
    }

    // Clean up test documents
    console.log("\n--> Cleaning up test records for users:", userA, userB);
    await PaymentModel.deleteMany({ userId: { $in: [userA, userB] } });

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

runVerificationTestSuite();

