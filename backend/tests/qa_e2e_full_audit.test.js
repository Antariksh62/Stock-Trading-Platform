const axios = require('axios');
const ioClient = require('socket.io-client');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const API_BASE = 'http://localhost:3001';
const DASHBOARD_BASE = 'http://localhost:3000';
const FRONTEND_BASE = 'http://localhost:5173';

const timestamp = Date.now();
const USER_A_EMAIL = `qa_user_a_${timestamp}@test.com`;
const USER_A_PASS = `Password123!`;
const USER_A_NAME = `QA User Alpha`;

const USER_B_EMAIL = `qa_user_b_${timestamp}@test.com`;
const USER_B_PASS = `Password456!`;
const USER_B_NAME = `QA User Beta`;

async function runComprehensiveQA() {
  console.log('================================================================');
  console.log('   ZERODHA TRADING PLATFORM — END-TO-END QA & AUDIT SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const auditLog = [];

  function record(category, testName, isPassed, details = '') {
    if (isPassed) {
      console.log(`[PASS] [${category}] ${testName}`);
      passed++;
      auditLog.push({ category, testName, status: 'PASS', details });
    } else {
      console.error(`[FAIL] [${category}] ${testName} -> ${details}`);
      failed++;
      auditLog.push({ category, testName, status: 'FAIL', details });
    }
  }

  let userAToken = null;
  let userAId = null;
  let userBToken = null;
  let userBId = null;

  try {
    // -------------------------------------------------------------
    // SECTION 1: AUTHENTICATION & SESSION HANDLING
    // -------------------------------------------------------------
    console.log('\n--- SECTION 1: AUTHENTICATION & SECURITY ---');

    // 1.1 Signup with valid data
    const signupARes = await axios.post(`${API_BASE}/signup`, {
      email: USER_A_EMAIL,
      password: USER_A_PASS,
      username: USER_A_NAME,
    });
    record('Auth', 'User A Valid Signup', signupARes.status === 201 && signupARes.data.success, `Created user ${USER_A_EMAIL}`);
    userAToken = signupARes.data.token;
    userAId = signupARes.data.user?._id || jwt.decode(userAToken)?.id;

    // 1.2 Duplicate email signup rejection
    try {
      await axios.post(`${API_BASE}/signup`, {
        email: USER_A_EMAIL,
        password: 'AnotherPassword',
        username: 'Duplicate User',
      });
      record('Auth', 'Duplicate Signup Rejection', false, 'Should have rejected duplicate email');
    } catch (err) {
      record('Auth', 'Duplicate Signup Rejection', err.response?.status === 400 || err.response?.data?.message?.includes('already exists'), 'Duplicate email correctly rejected');
    }

    // 1.3 Signup with incomplete data
    try {
      await axios.post(`${API_BASE}/signup`, {
        email: '',
        password: '',
      });
      record('Auth', 'Incomplete Signup Data Rejection', false, 'Should have rejected empty fields');
    } catch (err) {
      record('Auth', 'Incomplete Signup Data Rejection', err.response?.status === 400, 'Empty fields correctly rejected');
    }

    // 1.4 Valid Login
    const loginARes = await axios.post(`${API_BASE}/login`, {
      email: USER_A_EMAIL,
      password: USER_A_PASS,
    });
    record('Auth', 'User A Valid Login', loginARes.status === 200 && loginARes.data.success, 'Login successful with token');

    // 1.5 Invalid Login Password
    try {
      await axios.post(`${API_BASE}/login`, {
        email: USER_A_EMAIL,
        password: 'WrongPassword!',
      });
      record('Auth', 'Invalid Password Rejection', false, 'Should have rejected bad password');
    } catch (err) {
      record('Auth', 'Invalid Password Rejection', err.response?.status === 400 || err.response?.data?.message?.includes('Incorrect'), 'Bad credentials rejected');
    }

    // 1.6 Create User B for Account Isolation tests
    const signupBRes = await axios.post(`${API_BASE}/signup`, {
      email: USER_B_EMAIL,
      password: USER_B_PASS,
      username: USER_B_NAME,
    });
    userBToken = signupBRes.data.token;
    userBId = signupBRes.data.user?._id || jwt.decode(userBToken)?.id;
    record('Auth', 'User B Valid Signup', !!userBId, `Created second isolated user: ${USER_B_EMAIL}`);

    // -------------------------------------------------------------
    // SECTION 2: WEBSOCKET CONNECTIVITY & ROOM ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: WEBSOCKET ISOLATION & REAL-TIME STREAM ---');

    let socketAEvents = [];
    let socketBEvents = [];

    const socketA = ioClient(API_BASE, {
      auth: { token: userAToken, userId: String(userAId) },
      transports: ['websocket', 'polling']
    });

    const socketB = ioClient(API_BASE, {
      auth: { token: userBToken, userId: String(userBId) },
      transports: ['websocket', 'polling']
    });

    socketA.on('orders_update', (d) => socketAEvents.push({ type: 'orders', data: d }));
    socketA.on('funds_update', (d) => socketAEvents.push({ type: 'funds', data: d }));
    socketA.on('holdings_update', (d) => socketAEvents.push({ type: 'holdings', data: d }));

    socketB.on('orders_update', (d) => socketBEvents.push({ type: 'orders', data: d }));
    socketB.on('funds_update', (d) => socketBEvents.push({ type: 'funds', data: d }));

    await new Promise(r => setTimeout(r, 600));

    record('WebSockets', 'User A Socket Connected', socketA.connected, `Socket ID: ${socketA.id}`);
    record('WebSockets', 'User B Socket Connected', socketB.connected, `Socket ID: ${socketB.id}`);

    // -------------------------------------------------------------
    // SECTION 3: FUNDS MANAGEMENT & MUTATIONS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: FUNDS MANAGEMENT ---');

    // 3.1 Initial virtual funds check
    const fundsRes = await axios.get(`${API_BASE}/api/funds?userId=${userAId}`, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    const initialFunds = fundsRes.data.availableMargin;
    record('Funds', 'Initial Default Funds Allocation', fundsRes.status === 200 && initialFunds === 100000, `Available Margin: ₹${initialFunds}`);

    // 3.2 Add Funds (Deposit)
    const depositRes = await axios.post(`${API_BASE}/api/funds/add`, {
      userId: String(userAId),
      amount: 25000
    }, { headers: { Authorization: `Bearer ${userAToken}` } });
    record('Funds', 'Deposit Virtual Funds', depositRes.status === 200 && depositRes.data.funds.availableMargin === 125000, `New Margin: ₹${depositRes.data.funds?.availableMargin}`);

    // 3.3 Withdraw Funds (Valid amount)
    const withdrawRes = await axios.post(`${API_BASE}/api/funds/withdraw`, {
      userId: String(userAId),
      amount: 10000
    }, { headers: { Authorization: `Bearer ${userAToken}` } });
    record('Funds', 'Valid Withdrawal', withdrawRes.status === 200 && withdrawRes.data.funds.availableMargin === 115000, `New Margin: ₹${withdrawRes.data.funds?.availableMargin}`);

    // 3.4 Withdraw Funds exceeding balance
    try {
      await axios.post(`${API_BASE}/api/funds/withdraw`, {
        userId: String(userAId),
        amount: 9999999
      }, { headers: { Authorization: `Bearer ${userAToken}` } });
      record('Funds', 'Excessive Withdrawal Rejection', false, 'Should have rejected overdraft');
    } catch (err) {
      record('Funds', 'Excessive Withdrawal Rejection', err.response?.status === 400, 'Overdraft safely rejected with HTTP 400');
    }

    // -------------------------------------------------------------
    // SECTION 4: RELIABLE TRADING & ORDER EXECUTION WORKFLOW
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: TRADING & ORDER EXECUTION ---');

    // 4.1 Valid BUY Market Order
    const buyOrderRes = await axios.post(`${API_BASE}/newOrder`, {
      userId: String(userAId),
      name: 'TCS',
      qty: 10,
      price: 3500,
      mode: 'BUY',
      orderType: 'MARKET',
      product: 'CNC',
      idempotencyKey: `qa_buy_tcs_${timestamp}`
    }, { headers: { Authorization: `Bearer ${userAToken}` } });

    record('Trading', 'Market Buy Execution (TCS x 10 @ ₹3500)', 
      buyOrderRes.status === 201 && buyOrderRes.data.order.status === 'FILLED', 
      `Order status: ${buyOrderRes.data.order?.status}`);

    // Verify Funds deduction: 115000 - 35000 = 80000
    const fundsAfterBuy = await axios.get(`${API_BASE}/api/funds?userId=${userAId}`);
    record('Trading', 'Post-Buy Margin Deduction', 
      fundsAfterBuy.data.availableMargin === 80000, 
      `Margin after ₹35k purchase: ₹${fundsAfterBuy.data.availableMargin}`);

    // 4.2 Idempotency: Rapid duplicate request submission
    const duplicateRes = await axios.post(`${API_BASE}/newOrder`, {
      userId: String(userAId),
      name: 'TCS',
      qty: 10,
      price: 3500,
      mode: 'BUY',
      orderType: 'MARKET',
      product: 'CNC',
      idempotencyKey: `qa_buy_tcs_${timestamp}`
    }, { headers: { Authorization: `Bearer ${userAToken}` } });

    record('Trading', 'Idempotency Protection (Duplicate Submission)', 
      duplicateRes.data.isDuplicate === true && duplicateRes.data.order._id === buyOrderRes.data.order._id, 
      'Returned cached order without executing second trade');

    // Verify Funds were NOT deducted twice
    const fundsAfterDuplicate = await axios.get(`${API_BASE}/api/funds?userId=${userAId}`);
    record('Trading', 'Funds Intact after Duplicate Prevention', 
      fundsAfterDuplicate.data.availableMargin === 80000, 
      `Margin remained strictly at ₹${fundsAfterDuplicate.data.availableMargin}`);

    // 4.3 Insufficient Funds Rejection
    try {
      await axios.post(`${API_BASE}/newOrder`, {
        userId: String(userAId),
        name: 'MRF',
        qty: 100,
        price: 125000, // Total: ₹1.25 Crore
        mode: 'BUY',
        orderType: 'MARKET',
        product: 'CNC',
        idempotencyKey: `qa_insufficient_${timestamp}`
      });
      record('Trading', 'Insufficient Funds Rejection', false, 'Should reject order exceeding funds');
    } catch (err) {
      record('Trading', 'Insufficient Funds Rejection', 
        err.response?.status === 400 && err.response?.data?.status === 'REJECTED', 
        `Server rejected: ${err.response?.data?.message}`);
    }

    // 4.4 Valid Limit Order Placement (PENDING)
    const limitOrderRes = await axios.post(`${API_BASE}/newOrder`, {
      userId: String(userAId),
      name: 'INFY',
      qty: 5,
      price: 1540,
      limitPrice: 1500,
      mode: 'BUY',
      orderType: 'LIMIT',
      product: 'CNC',
      idempotencyKey: `qa_limit_infy_${timestamp}`
    });

    record('Trading', 'Limit Order Placement (PENDING)', 
      limitOrderRes.status === 201 && limitOrderRes.data.order.status === 'PENDING', 
      `Order status: ${limitOrderRes.data.order?.status}`);

    // 4.5 Limit Order Cancellation (CANCELLED)
    const pendingOrderId = limitOrderRes.data.order._id;
    const cancelOrderRes = await axios.post(`${API_BASE}/cancelOrder/${pendingOrderId}`, {
      userId: String(userAId)
    });

    record('Trading', 'Limit Order Cancellation', 
      cancelOrderRes.status === 200 && cancelOrderRes.data.order.status === 'CANCELLED', 
      `Order updated to: ${cancelOrderRes.data.order?.status}`);

    // 4.6 Sell Order (Valid Quantity)
    const sellRes = await axios.post(`${API_BASE}/newOrder`, {
      userId: String(userAId),
      name: 'TCS',
      qty: 4, // Owns 10, sells 4
      price: 3600,
      mode: 'SELL',
      orderType: 'MARKET',
      product: 'CNC',
      idempotencyKey: `qa_sell_tcs_${timestamp}`
    });

    record('Trading', 'Valid Share Sale (4 of 10 TCS @ ₹3600)', 
      sellRes.status === 201 && sellRes.data.order.status === 'FILLED', 
      `Sale proceeds credited; Order status: ${sellRes.data.order?.status}`);

    // 4.7 Sell Order exceeding owned quantity
    try {
      await axios.post(`${API_BASE}/newOrder`, {
        userId: String(userAId),
        name: 'TCS',
        qty: 100, // Only has 6 left
        price: 3600,
        mode: 'SELL',
        orderType: 'MARKET',
        product: 'CNC',
        idempotencyKey: `qa_sell_excess_${timestamp}`
      });
      record('Trading', 'Excessive Sell Quantity Rejection', false, 'Should reject selling more shares than owned');
    } catch (err) {
      record('Trading', 'Excessive Sell Quantity Rejection', 
        err.response?.status === 400 && err.response?.data?.status === 'REJECTED', 
        `Server rejection reason: ${err.response?.data?.rejectionReason}`);
    }

    // 4.8 Concurrency Mutex Race Condition Test
    console.log('\n--- SECTION 5: CONCURRENCY & RACE CONDITIONS ---');
    const concUser = `conc_qa_${timestamp}`;
    await axios.get(`${API_BASE}/api/funds?userId=${concUser}`); // Initialized with ₹100,000
    
    // Launch 4 concurrent buy requests costing ₹40,000 each (4 * 40k = 160k > 100k). Exactly 2 must succeed, 2 must reject.
    const parallelOrders = [1, 2, 3, 4].map(idx => 
      axios.post(`${API_BASE}/newOrder`, {
        userId: concUser,
        name: 'INFY',
        qty: 1,
        price: 40000,
        mode: 'BUY',
        orderType: 'MARKET',
        product: 'CNC',
        idempotencyKey: `conc_${concUser}_${idx}`
      }).then(r => ({ status: 'FILLED', data: r.data }))
        .catch(e => ({ status: 'REJECTED', err: e.response?.data }))
    );

    const parallelResults = await Promise.all(parallelOrders);
    const filledCount = parallelResults.filter(r => r.status === 'FILLED').length;
    const rejectedCount = parallelResults.filter(r => r.status === 'REJECTED').length;
    const concFinalFunds = await axios.get(`${API_BASE}/api/funds?userId=${concUser}`);

    record('Concurrency', 'Parallel Order Serialization (Mutex Locking)', 
      filledCount === 2 && rejectedCount === 2, 
      `Result: ${filledCount} FILLED, ${rejectedCount} REJECTED due to funds exhaustion`);

    record('Concurrency', 'Balance Integrity (No Double-Spending)', 
      concFinalFunds.data.availableMargin === 20000, 
      `Remaining funds: ₹${concFinalFunds.data.availableMargin} (Expected exact ₹20,000)`);

    // -------------------------------------------------------------
    // SECTION 6: CROSS-USER DATA ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 6: CROSS-USER DATA ISOLATION ---');

    // Verify WebSocket isolation: User A's order broadcasts should NOT leak into User B's events
    const leakedEventsToB = socketBEvents.filter(e => {
      if (e.type === 'orders') {
        return e.data.some(o => o.userId === String(userAId));
      }
      return false;
    });

    record('Security', 'WebSocket Room Data Isolation', 
      leakedEventsToB.length === 0, 
      `Zero cross-user leaked socket events to User B (total events received: ${socketBEvents.length})`);

    // -------------------------------------------------------------
    // SECTION 7: AI PORTFOLIO ANALYST
    // -------------------------------------------------------------
    console.log('\n--- SECTION 7: AI PORTFOLIO ANALYST (GEMINI API) ---');

    const aiRes = await axios.post(`${API_BASE}/api/portfolio/analyze`, {
      userId: String(userAId)
    }, { headers: { Authorization: `Bearer ${userAToken}` } });

    record('AI Analyst', 'AI Endpoint Reachability & HTTP 200', 
      aiRes.status === 200 && aiRes.data.success === true, 
      `Source: ${aiRes.data.source}`);

    record('AI Analyst', 'Structured Output Schema Validation', 
      aiRes.data.analysis && 
      typeof aiRes.data.analysis.overview === 'string' &&
      typeof aiRes.data.analysis.concentrationAnalysis === 'string' &&
      typeof aiRes.data.analysis.riskObservations === 'string', 
      'Contains complete Overview, Concentration, Risk, and Suggestions');

    record('AI Analyst', 'Quantitative Authoritative Facts Pre-Calculated', 
      aiRes.data.metrics && 
      aiRes.data.metrics.totalInvestment > 0 && 
      aiRes.data.metrics.holdingsCount > 0, 
      `Holdings count: ${aiRes.data.metrics?.holdingsCount}, Total Investment: ₹${aiRes.data.metrics?.totalInvestment}`);

    record('AI Analyst', 'Regulatory Disclaimer Included', 
      typeof aiRes.data.disclaimer === 'string' && aiRes.data.disclaimer.length > 20, 
      'Informational paper-trading disclaimer attached');

    // -------------------------------------------------------------
    // SECTION 8: WEB APPLICATION ROUTES & SERVERS HEALTH
    // -------------------------------------------------------------
    console.log('\n--- SECTION 8: APP HEALTH & ROUTES AVAILABILITY ---');

    // Frontend Vite marketing routes
    const frontendRes = await axios.get(FRONTEND_BASE);
    record('WebApps', 'Frontend Marketing Web App (Port 5173)', frontendRes.status === 200, 'HTTP 200 OK');

    // Dashboard React app
    const dashboardRes = await axios.get(DASHBOARD_BASE);
    record('WebApps', 'Trading Dashboard Web App (Port 3000)', dashboardRes.status === 200, 'HTTP 200 OK');

    // Backend REST status
    const backendHoldingsRes = await axios.get(`${API_BASE}/allHoldings`);
    record('WebApps', 'Backend Database Holdings API (Port 3001)', backendHoldingsRes.status === 200, 'HTTP 200 OK');

    socketA.disconnect();
    socketB.disconnect();

    console.log('\n================================================================');
    console.log(`FINAL AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED (${((passed/(passed+failed))*100).toFixed(1)}% SUCCESS)`);
    console.log('================================================================');

    return { passed, failed, auditLog };
  } catch (err) {
    console.error('Fatal QA error:', err.message);
    if (err.response) console.error('Response data:', err.response.data);
    process.exit(1);
  }
}

runComprehensiveQA().then(({ failed }) => {
  process.exit(failed > 0 ? 1 : 0);
});
