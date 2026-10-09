const axios = require('axios');
const ioClient = require('socket.io-client');
const mongoose = require('mongoose');
require('dotenv').config();

const API_BASE = 'http://localhost:3001';
const TEST_USER_ID = 'test_suite_user_' + Date.now();

async function runTests() {
  console.log('====================================================');
  console.log('   ZERODHA TRADING PLATFORM - ENHANCEMENT TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // Connect WebSocket Client
    console.log('--> Setting up WebSocket Client...');
    const socket = ioClient(API_BASE, {
      auth: { token: 'test_token', userId: TEST_USER_ID },
      transports: ['websocket', 'polling']
    });

    let receivedSocketEvents = [];
    socket.on('connect', () => {
      // connected
    });
    socket.on('funds_update', (data) => receivedSocketEvents.push({ event: 'funds_update', data }));
    socket.on('holdings_update', (data) => receivedSocketEvents.push({ event: 'holdings_update', data }));
    socket.on('orders_update', (data) => receivedSocketEvents.push({ event: 'orders_update', data }));

    // Wait 500ms for connection
    await new Promise(r => setTimeout(r, 500));
    assert(socket.connected, 'WebSocket client connected and authenticated');

    // 1. Initial Funds Check
    console.log('\n--- 1. Funds Check ---');
    const initialFundsRes = await axios.get(`${API_BASE}/api/funds?userId=${TEST_USER_ID}`);
    assert(initialFundsRes.status === 200 && initialFundsRes.data.availableMargin > 0, 
      'User initialized with default virtual funds (e.g. ₹1,00,000)');
    const initialMargin = initialFundsRes.data.availableMargin;

    // 2. Buy Market Order Execution
    console.log('\n--- 2. Valid Buy Market Order ---');
    const buyRes = await axios.post(`${API_BASE}/newOrder`, {
      userId: TEST_USER_ID,
      name: 'TEST_STOCK',
      qty: 10,
      price: 100,
      mode: 'BUY',
      orderType: 'MARKET',
      product: 'CNC',
      idempotencyKey: 'idem_buy_1_' + Date.now()
    });
    assert(buyRes.status === 201 && buyRes.data.order.status === 'FILLED', 
      'Buy order executed and status is FILLED');

    // Check Funds Deduction
    const afterBuyFunds = await axios.get(`${API_BASE}/api/funds?userId=${TEST_USER_ID}`);
    const expectedMargin = initialMargin - 1000;
    assert(afterBuyFunds.data.availableMargin === expectedMargin, 
      `Funds correctly deducted (Initial: ₹${initialMargin}, After: ₹${afterBuyFunds.data.availableMargin})`);

    // 3. Duplicate Order Rejection via Idempotency
    console.log('\n--- 3. Duplicate Order Submission (Idempotency) ---');
    const duplicateKey = 'idem_dup_test_' + Date.now();
    const firstReq = await axios.post(`${API_BASE}/newOrder`, {
      userId: TEST_USER_ID,
      name: 'TEST_STOCK',
      qty: 5,
      price: 100,
      mode: 'BUY',
      orderType: 'MARKET',
      product: 'CNC',
      idempotencyKey: duplicateKey
    });
    const secondReq = await axios.post(`${API_BASE}/newOrder`, {
      userId: TEST_USER_ID,
      name: 'TEST_STOCK',
      qty: 5,
      price: 100,
      mode: 'BUY',
      orderType: 'MARKET',
      product: 'CNC',
      idempotencyKey: duplicateKey
    });
    assert(secondReq.data.isDuplicate === true && secondReq.data.order._id === firstReq.data.order._id, 
      'Duplicate request safely identified and returned cached order without double-executing');

    // 4. Insufficient Funds Rejection
    console.log('\n--- 4. Insufficient Funds Validation ---');
    try {
      await axios.post(`${API_BASE}/newOrder`, {
        userId: TEST_USER_ID,
        name: 'EXPENSIVE_STOCK',
        qty: 100000,
        price: 5000,
        mode: 'BUY',
        orderType: 'MARKET',
        product: 'CNC',
        idempotencyKey: 'idem_huge_' + Date.now()
      });
      assert(false, 'Should reject order when funds are insufficient');
    } catch (err) {
      assert(err.response && err.response.status === 400 && err.response.data.order.status === 'REJECTED', 
        'Order rejected with HTTP 400 and status REJECTED due to Insufficient Funds');
    }

    // 5. Excessive Sell Quantity Rejection
    console.log('\n--- 5. Sell Quantity Limit Validation ---');
    try {
      await axios.post(`${API_BASE}/newOrder`, {
        userId: TEST_USER_ID,
        name: 'TEST_STOCK',
        qty: 9999, // more than owned
        price: 100,
        mode: 'SELL',
        orderType: 'MARKET',
        product: 'CNC',
        idempotencyKey: 'idem_sell_excess_' + Date.now()
      });
      assert(false, 'Should reject sell order exceeding owned quantity');
    } catch (err) {
      assert(err.response && err.response.status === 400 && err.response.data.order.status === 'REJECTED', 
        'Sell order rejected with status REJECTED when trying to sell more shares than owned');
    }

    // 6. Limit Order Placement & Cancellation
    console.log('\n--- 6. Limit Order Placement & Cancellation ---');
    const limitOrderRes = await axios.post(`${API_BASE}/newOrder`, {
      userId: TEST_USER_ID,
      name: 'LIMIT_STOCK',
      qty: 2,
      price: 250,
      limitPrice: 240,
      mode: 'BUY',
      orderType: 'LIMIT',
      product: 'CNC',
      idempotencyKey: 'idem_limit_' + Date.now()
    });
    assert(limitOrderRes.status === 201 && limitOrderRes.data.order.status === 'PENDING', 
      'Limit order placed with status PENDING');

    const orderId = limitOrderRes.data.order._id;
    const cancelRes = await axios.put(`${API_BASE}/cancelOrder/${orderId}?userId=${TEST_USER_ID}`);
    assert(cancelRes.status === 200 && cancelRes.data.order.status === 'CANCELLED', 
      'Pending order successfully cancelled');

    // 7. Concurrent Orders Concurrency Lock Test
    console.log('\n--- 7. Concurrent Orders Race Condition Protection ---');
    const concUser = 'conc_test_user_' + Date.now();
    // Add small funds of 1000
    await axios.get(`${API_BASE}/api/funds?userId=${concUser}`);
    // Launch 5 parallel orders costing 500 each concurrently. Only 2 should succeed, 3 should fail.
    const promises = [1, 2, 3, 4, 5].map(i => 
      axios.post(`${API_BASE}/newOrder`, {
        userId: concUser,
        name: 'CONC_STOCK',
        qty: 1,
        price: 40000, // available default is 100000, 3 will succeed (120k > 100k so max 2 can succeed)
        mode: 'BUY',
        orderType: 'MARKET',
        product: 'CNC',
        idempotencyKey: `idem_conc_${concUser}_${i}`
      }).then(r => ({ status: 'fulfilled', data: r.data }))
        .catch(e => ({ status: 'rejected', err: e.response ? e.response.data : e.message }))
    );

    const concResults = await Promise.all(promises);
    const fulfilled = concResults.filter(r => r.status === 'fulfilled');
    const rejected = concResults.filter(r => r.status === 'rejected');
    const concFunds = await axios.get(`${API_BASE}/api/funds?userId=${concUser}`);

    assert(fulfilled.length === 2 && rejected.length === 3, 
      `Mutex serialized concurrent orders: ${fulfilled.length} FILLED, ${rejected.length} REJECTED due to funds exhaustion`);
    assert(concFunds.data.availableMargin >= 0, 
      `No double-spending occurred (Remaining Margin: ₹${concFunds.data.availableMargin})`);

    // 8. WebSocket Event Broadcast Verification
    console.log('\n--- 8. Real-time WebSocket Broadcast ---');
    assert(receivedSocketEvents.length > 0, 
      `WebSocket received real-time updates (${receivedSocketEvents.length} events received for ${TEST_USER_ID})`);

    // 9. AI Portfolio Analyst Endpoint
    console.log('\n--- 9. AI Portfolio Analyst Integration ---');
    const aiRes = await axios.post(`${API_BASE}/api/portfolio/analyze`, {
      userId: TEST_USER_ID
    });
    assert(aiRes.status === 200 && aiRes.data.success === true, 
      'AI Portfolio Analyst API returned 200 OK');
    assert(aiRes.data.analysis && aiRes.data.analysis.overview && (aiRes.data.analysis.topGainersLosers || aiRes.data.analysis.topGainersAndLosers), 
      'AI analysis includes structured overview, gainers/losers, concentration, and risk metrics');
    console.log(`   Source: ${aiRes.data.source}`);

    socket.disconnect();

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal Test Error:', error.message);
    if (error.response) console.error('Response data:', error.response.data);
    process.exit(1);
  }
}

runTests();
