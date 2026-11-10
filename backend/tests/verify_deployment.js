const axios = require("axios");
const { io } = require("socket.io-client");

const BASE_URL = "http://localhost:3002";

async function runFullVerification() {
  console.log("=== STARTING FULL PLATFORM VERIFICATION ===");
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Static Routes & Client-Side Routing
  console.log("\n[1] Testing Static HTML & Client-Side Routing:");
  try {
    const homeRes = await axios.get(`${BASE_URL}/`);
    assert(homeRes.status === 200 && homeRes.data.includes("<div id=\"root\">"), "Root (/) returns Marketing Landing Page");

    const signupRes = await axios.get(`${BASE_URL}/signup`);
    assert(signupRes.status === 200 && signupRes.data.includes("<div id=\"root\">"), "Client route (/signup) caught by SPA catch-all");

    const dashRes = await axios.get(`${BASE_URL}/dashboard`);
    assert(dashRes.status === 200 && dashRes.data.includes("Stock Broking Platform"), "Dashboard (/dashboard) returns Trading Terminal HTML");

    const ordersRes = await axios.get(`${BASE_URL}/orders`);
    assert(ordersRes.status === 200 && ordersRes.data.includes("Stock Broking Platform"), "Dashboard view (/orders) returns Trading Terminal HTML");
  } catch (e) {
    assert(false, `Static routes error: ${e.message}`);
  }

  // 2. Market Data Endpoints
  console.log("\n[2] Testing Market Data & Live Tickers:");
  try {
    const tickerRes = await axios.get(`${BASE_URL}/api/ticker`);
    assert(tickerRes.status === 200 && tickerRes.data.indices?.nifty?.points > 0, `Live Ticker returns Nifty: ${tickerRes.data.indices?.nifty?.points}`);

    const indicesRes = await axios.get(`${BASE_URL}/api/indices`);
    assert(indicesRes.status === 200 && indicesRes.data.indices?.sensex?.points > 0, `Market Indices returns Sensex: ${indicesRes.data.indices?.sensex?.points}`);

    const quotesRes = await axios.get(`${BASE_URL}/api/quotes?symbols=RELIANCE,TCS`);
    assert(quotesRes.status === 200 && quotesRes.data.quotes, "Batch stock quotes (/api/quotes) returned successfully");
  } catch (e) {
    assert(false, `Market data error: ${e.message}`);
  }

  // 3. User Authentication Flow
  console.log("\n[3] Testing User Authentication Flow:");
  const testId = Date.now().toString().slice(-6);
  const testUser = {
    email: `trader_${testId}@testzerodha.io`,
    username: `trader_${testId}`,
    password: "Password@123",
  };
  let userToken = "";
  let userId = "";

  try {
    const signupRes = await axios.post(`${BASE_URL}/signup`, testUser);
    assert(signupRes.status === 201 && signupRes.data.success, "User Signup (/signup) succeeded");
    userToken = signupRes.data.token;
    userId = signupRes.data.user._id || signupRes.data.user.id;
    assert(userToken && userId, `JWT token and User ID issued: ${userId}`);

    // Verify token endpoint
    const verifyRes = await axios.post(`${BASE_URL}/verify`, {}, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert(verifyRes.data.status === true, "Token Verification (/verify) passed");

    // Login with same credentials
    const loginRes = await axios.post(`${BASE_URL}/login`, {
      email: testUser.email,
      password: testUser.password,
    });
    assert(loginRes.data.success === true, "User Login (/login) re-authenticated successfully");
  } catch (e) {
    assert(false, `Auth flow error: ${e.response?.data?.message || e.message}`);
  }

  // 4. Funds Management Flow
  console.log("\n[4] Testing Funds Management Flow:");
  const authConfig = {
    headers: { Authorization: `Bearer ${userToken}` },
  };

  try {
    const initialFunds = await axios.get(`${BASE_URL}/api/funds`, authConfig);
    assert(initialFunds.status === 200, `Initial Funds fetched: Available Cash = ₹${initialFunds.data.availableCash}`);

    // Add UPI funds
    const depositAmount = 25000;
    const addFundsRes = await axios.post(`${BASE_URL}/api/funds/add`, { amount: depositAmount }, authConfig);
    assert(addFundsRes.data.success && addFundsRes.data.funds.availableCash >= depositAmount, `UPI Deposit added ₹${depositAmount} -> New Cash: ₹${addFundsRes.data.funds.availableCash}`);

    // Withdraw a small amount
    const withdrawRes = await axios.post(`${BASE_URL}/api/funds/withdraw`, { amount: 1000 }, authConfig);
    assert(withdrawRes.data.success && withdrawRes.data.funds.availableCash >= depositAmount - 1000, `Withdrawal processed -> New Cash: ₹${withdrawRes.data.funds.availableCash}`);
  } catch (e) {
    assert(false, `Funds flow error: ${e.response?.data?.message || e.message}`);
  }

  // 5. Order Placement & Portfolio Execution
  console.log("\n[5] Testing Order Placement & Portfolio Holdings:");
  try {
    const orderPayload = {
      name: "RELIANCE",
      qty: 2,
      price: 2850.50,
      mode: "BUY",
      product: "CNC",
      orderType: "MARKET",
      idempotencyKey: `test_order_${testId}`,
    };

    const orderRes = await axios.post(`${BASE_URL}/newOrder`, orderPayload, authConfig);
    assert(orderRes.status === 201 && orderRes.data.success, `Order placed successfully: ${orderPayload.qty}x ${orderPayload.name} (Status: ${orderRes.data.order?.status})`);

    // Verify in Orders book
    const allOrdersRes = await axios.get(`${BASE_URL}/allOrders`, authConfig);
    assert(allOrdersRes.data.some((o) => o.name === "RELIANCE"), "Order appears in user order book (/allOrders)");

    // Verify in Holdings
    const allHoldingsRes = await axios.get(`${BASE_URL}/allHoldings`, authConfig);
    assert(allHoldingsRes.data.some((h) => h.name === "RELIANCE" && h.qty >= 2), "Purchased stock appears in CNC holdings (/allHoldings)");
  } catch (e) {
    assert(false, `Order execution error: ${e.response?.data?.message || e.message}`);
  }

  // 6. AI Portfolio Analyst
  console.log("\n[6] Testing AI Portfolio Analyst:");
  try {
    const aiRes = await axios.post(`${BASE_URL}/api/portfolio/analyze`, {}, authConfig);
    assert(aiRes.status === 200 && aiRes.data.success, `AI Portfolio analysis generated (${aiRes.data.source})`);
    assert(aiRes.data.metrics && aiRes.data.analysis && aiRes.data.metrics.totalCurrentValue !== undefined, `Calculated portfolio value: ₹${aiRes.data.metrics?.totalCurrentValue}`);
  } catch (e) {
    assert(false, `AI Analyst error: ${e.response?.data?.message || e.message}`);
  }

  // 7. WebSocket / Socket.IO Connection
  console.log("\n[7] Testing Socket.IO Real-Time Stream:");
  await new Promise((resolve) => {
    const socket = io(BASE_URL, {
      auth: { token: userToken, userId },
      transports: ["websocket", "polling"],
      timeout: 5000,
    });

    socket.on("connect", () => {
      assert(true, `Socket.IO connected to backend (Socket ID: ${socket.id})`);
    });

    socket.on("ticker_update", (data) => {
      assert(Boolean(data), "Socket.IO received real-time 'ticker_update' event");
      socket.disconnect();
      resolve();
    });

    socket.on("connect_error", (err) => {
      assert(false, `Socket.IO connection error: ${err.message}`);
      socket.disconnect();
      resolve();
    });

    setTimeout(() => {
      socket.disconnect();
      resolve();
    }, 4000);
  });

  console.log("\n=========================================");
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("=========================================\n");

  if (failed === 0) {
    console.log("ALL SYSTEMS VERIFIED AND FULLY OPERATIONAL!");
    process.exit(0);
  } else {
    console.error("SOME VERIFICATIONS FAILED!");
    process.exit(1);
  }
}

runFullVerification();

