const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config();
// Gemini API and WebSockets enabled

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { Server } = require("socket.io");

const { HoldingsModel } = require("./model/HoldingsModel");
const { PositionsModel } = require("./model/PositionsModel");
const { OrdersModel } = require("./model/OrdersModel");
const { FundsModel } = require("./model/FundsModel");
const { WalletTransactionModel } = require("./model/WalletTransactionModel");
const { UserModel } = require("./model/UserModel");
const { Signup, Login, Logout } = require("./controllers/AuthController");
const { userVerification } = require("./middlewares/AuthMiddleware");

const { processOrder, cancelOrder, getOrCreateUserFunds } = require("./services/orderExecutionService");
const { getUserTransactionHistory } = require("./services/paymentService");
const { analyzePortfolio } = require("./services/portfolioAnalystService");
const { tickerService } = require("./services/tickerService");
const { validateRazorpayConfig } = require("./config/razorpay");
const {
  startReconciliationScheduler,
  stopReconciliationScheduler,
} = require("./services/paymentReconciliationService");
const paymentRoutes = require("./routes/paymentRoutes");
const webhookRoutes = require("./routes/webhookRoutes");

const PORT = process.env.PORT || 3002;
const uri = process.env.MONGO_URL;

const app = express();
const server = http.createServer(app);

// 1. WebSocket Server (Socket.IO)
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  const passedUserId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.TOKEN_KEY);
      socket.userId = String(decoded.id);
    } catch (e) {
      socket.userId = passedUserId || "demo_user";
    }
  } else {
    socket.userId = passedUserId || "demo_user";
  }
  next();
});

io.on("connection", (socket) => {
  const userRoom = `user_${socket.userId}`;
  socket.join(userRoom);
  console.log(`[WebSocket] Client ${socket.id} connected and joined room: ${userRoom}`);

  // Push immediate cached ticker state on connect
  socket.emit("ticker_update", tickerService.getLatest());

  socket.on("disconnect", () => {
    console.log(`[WebSocket] Client ${socket.id} disconnected`);
  });
});

// Helper to broadcast real-time state changes to a specific authenticated user room
const broadcastUserUpdates = async (userId) => {
  try {
    const room = `user_${userId}`;
    const [holdings, positions, orders, funds] = await Promise.all([
      HoldingsModel.find({ userId }),
      PositionsModel.find({ userId }),
      OrdersModel.find({ userId }).sort({ createdAt: -1 }),
      getOrCreateUserFunds(userId),
    ]);

    io.to(room).emit("holdings_update", holdings);
    io.to(room).emit("positions_update", positions);
    io.to(room).emit("orders_update", orders);
    io.to(room).emit("funds_update", funds);
  } catch (err) {
    console.error("[WebSocket Broadcast Error]:", err);
  }
};

// Register broadcast handler with central socket service
const { setBroadcastHandler } = require("./services/socketService");
setBroadcastHandler(broadcastUserUpdates);

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(cookieParser());

// ==========================================
// RAW BODY MIDDLEWARE & WEBHOOK ROUTING
// Razorpay webhooks require pristine raw request body for HMAC verification.
// Mounted BEFORE standard bodyParser.json().
// ==========================================
app.use(
  "/api/webhooks",
  express.raw({ type: "*/*" }),
  (req, res, next) => {
    req.rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(req.body || "");
    next();
  },
  webhookRoutes
);

// Standard JSON body parser with rawBody preservation for all other API routes
app.use(
  bodyParser.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Helper middleware to extract user from token or fallback to demo_user
const authHelper = (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.TOKEN_KEY);
      req.userId = String(decoded.id);
    } catch (err) {
      req.userId = req.body?.userId || req.query?.userId || "demo_user";
    }
  } else {
    req.userId = req.body?.userId || req.query?.userId || "demo_user";
  }
  next();
};

// ==========================================
// 1. DATA SEEDING ROUTES (Deprecated - Holdings and Positions are generated dynamically via live orders)
// ==========================================
app.get("/addHoldings", (req, res) => {
  res.json({ message: "Seeding disabled. Holdings are generated automatically when CNC buy orders are executed." });
});

app.get("/addPositions", (req, res) => {
  res.json({ message: "Seeding disabled. Positions are generated automatically when MIS buy orders are executed." });
});

// ==========================================
// 2. CORE PORTFOLIO & ORDER ROUTES
// ==========================================
app.get("/allHoldings", authHelper, async (req, res) => {
  try {
    const allHoldings = await HoldingsModel.find({ userId: req.userId });
    res.json(allHoldings);
  } catch (error) {
    console.error("Error fetching holdings:", error);
    res.status(500).json({ error: "Failed to fetch holdings" });
  }
});

app.get("/allPositions", authHelper, async (req, res) => {
  try {
    const allPositions = await PositionsModel.find({ userId: req.userId });
    res.json(allPositions);
  } catch (error) {
    console.error("Error fetching positions:", error);
    res.status(500).json({ error: "Failed to fetch positions" });
  }
});

app.get("/allOrders", authHelper, async (req, res) => {
  try {
    const allOrders = await OrdersModel.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(allOrders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Robust Order Placement with Concurrency & Idempotency Protection
app.post("/newOrder", authHelper, async (req, res) => {
  try {
    const { name, qty, price, mode, product, orderType, limitPrice, idempotencyKey } = req.body;

    const result = await processOrder({
      userId: req.userId,
      name,
      qty,
      price,
      mode,
      product: product || "CNC",
      orderType: orderType || "MARKET",
      limitPrice: limitPrice || null,
      idempotencyKey: idempotencyKey || null,
    });

    if (result.success) {
      // Broadcast WebSocket real-time updates to the authenticated user
      broadcastUserUpdates(req.userId);
      return res.status(201).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    console.error("Error processing order:", error);
    res.status(500).json({ success: false, status: "ERROR", message: error.message || "Failed to process order" });
  }
});

// Cancel Pending Limit Orders
const handleCancelOrderReq = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await cancelOrder(id, req.userId);

    if (result.success) {
      broadcastUserUpdates(req.userId);
      return res.status(200).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ success: false, message: "Failed to cancel order" });
  }
};
app.post("/cancelOrder/:id", authHelper, handleCancelOrderReq);
app.put("/cancelOrder/:id", authHelper, handleCancelOrderReq);

// ==========================================
// 2b. REAL-TIME MARKET INDICES (Yahoo Finance Live Data)
// ==========================================
let indicesCache = null;
let lastIndicesFetch = 0;

app.get("/api/indices", async (req, res) => {
  const now = Date.now();
  if (indicesCache && now - lastIndicesFetch < 30000) {
    return res.json(indicesCache);
  }

  // Calculate market status in IST (UTC+5:30)
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600000);
  const day = ist.getDay(); // 0 is Sun, 6 is Sat
  const mins = ist.getHours() * 60 + ist.getMinutes();
  const isMarketOpen = day >= 1 && day <= 5 && mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;

  try {
    const [niftyRes, sensexRes, ndxRes] = await Promise.all([
      axios.get("https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI", { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 7000 }),
      axios.get("https://query1.finance.yahoo.com/v8/finance/chart/%5EBSESN", { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 7000 }),
      axios.get("https://query1.finance.yahoo.com/v8/finance/chart/%5ENDX", { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 7000 }),
    ]);

    const formatIndex = (resObj, name) => {
      const meta = resObj.data?.chart?.result?.[0]?.meta;
      if (!meta) return null;
      const price = Number(meta.regularMarketPrice || 0);
      const prevClose = Number(meta.chartPreviousClose || price);
      const diff = price - prevClose;
      const pct = prevClose > 0 ? (diff / prevClose) * 100 : 0;
      return {
        name,
        points: Number(price.toFixed(2)),
        percent: (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%",
        isDown: pct < 0,
        prevClose: Number(prevClose.toFixed(2)),
      };
    };

    const nifty = formatIndex(niftyRes, "NIFTY 50") || { name: "NIFTY 50", points: 22520.45, percent: "+1.30%", isDown: false };
    const sensex = formatIndex(sensexRes, "SENSEX") || { name: "SENSEX", points: 72472.33, percent: "+1.23%", isDown: false };
    const nasdaq = formatIndex(ndxRes, "NASDAQ 100") || { name: "NASDAQ 100", points: 20883.15, percent: "+0.51%", isDown: false };

    indicesCache = {
      isMarketOpen,
      lastUpdated: new Date().toISOString(),
      indices: { nifty, sensex, nasdaq },
    };
    lastIndicesFetch = now;
    return res.json(indicesCache);
  } catch (err) {
    if (indicesCache) return res.json(indicesCache);
    return res.json({
      isMarketOpen,
      lastUpdated: new Date().toISOString(),
      indices: {
        nifty: { name: "NIFTY 50", points: 22520.45, percent: "+1.30%", isDown: false },
        sensex: { name: "SENSEX", points: 72472.33, percent: "+1.23%", isDown: false },
        nasdaq: { name: "NASDAQ 100", points: 20883.15, percent: "+0.51%", isDown: false },
      },
    });
  }
});

// ==========================================
// 3. FUNDS MANAGEMENT ROUTES
// ==========================================
app.get("/api/funds", authHelper, async (req, res) => {
  try {
    const funds = await getOrCreateUserFunds(req.userId);
    res.json(funds);
  } catch (error) {
    console.error("Error fetching funds:", error);
    res.status(500).json({ error: "Failed to fetch funds" });
  }
});

app.get("/api/funds/transactions", authHelper, async (req, res) => {
  try {
    const { page, limit, type } = req.query || {};
    const history = await getUserTransactionHistory({
      userId: req.userId,
      page,
      limit,
      type,
    });
    res.json(history);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch transactions",
    });
  }
});

app.post("/api/funds/add", authHelper, async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0" });
    }

    const funds = await getOrCreateUserFunds(req.userId);
    const balanceBefore = funds.availableMargin;
    funds.availableCash = Number((funds.availableCash + amount).toFixed(2));
    funds.availableMargin = Number((funds.availableMargin + amount).toFixed(2));
    funds.payin = Number((funds.payin + amount).toFixed(2));
    funds.updatedAt = new Date();
    await funds.save();

    // Record immutable ledger transaction
    const paymentId = `UPI_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    await WalletTransactionModel.create({
      userId: String(req.userId),
      paymentId,
      type: "DEPOSIT",
      transactionType: "DEPOSIT",
      amount: Math.round(amount * 100),
      amountPaise: Math.round(amount * 100),
      amountRupees: amount,
      currency: "INR",
      balanceBefore,
      balanceBeforeRupees: balanceBefore,
      balanceAfter: funds.availableMargin,
      balanceAfterRupees: funds.availableMargin,
      status: "COMPLETED",
      description: `Simulated UPI Deposit (${paymentId})`,
      timestamp: new Date(),
    }).catch((txErr) => console.warn("Ledger record warning for UPI deposit:", txErr.message));

    broadcastUserUpdates(req.userId);
    res.json({ success: true, message: `₹${amount.toLocaleString()} added successfully via UPI`, funds });
  } catch (error) {
    console.error("Error adding funds:", error);
    res.status(500).json({ error: "Failed to add funds" });
  }
});

app.post("/api/funds/withdraw", authHelper, async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0" });
    }

    const funds = await getOrCreateUserFunds(req.userId);
    if (amount > funds.availableCash) {
      return res.status(400).json({ message: "Withdrawal amount exceeds available cash" });
    }

    const balanceBefore = funds.availableMargin;
    funds.availableCash = Number((funds.availableCash - amount).toFixed(2));
    funds.availableMargin = Number((funds.availableMargin - amount).toFixed(2));
    funds.updatedAt = new Date();
    await funds.save();

    // Record immutable ledger transaction
    const paymentId = `WTH_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    await WalletTransactionModel.create({
      userId: String(req.userId),
      paymentId,
      type: "WITHDRAWAL",
      transactionType: "WITHDRAWAL",
      amount: Math.round(amount * 100),
      amountPaise: Math.round(amount * 100),
      amountRupees: amount,
      currency: "INR",
      balanceBefore,
      balanceBeforeRupees: balanceBefore,
      balanceAfter: funds.availableMargin,
      balanceAfterRupees: funds.availableMargin,
      status: "COMPLETED",
      description: `Simulated Bank Withdrawal (${paymentId})`,
      timestamp: new Date(),
    }).catch((txErr) => console.warn("Ledger record warning for withdrawal:", txErr.message));

    broadcastUserUpdates(req.userId);
    res.json({ success: true, message: `Withdrawal request for ₹${amount.toLocaleString()} placed`, funds });
  } catch (error) {
    console.error("Error withdrawing funds:", error);
    res.status(500).json({ error: "Failed to withdraw funds" });
  }
});

// ==========================================
// 4. AI PORTFOLIO ANALYST (GEMINI API)
// ==========================================
app.post("/api/portfolio/analyze", authHelper, async (req, res) => {
  try {
    const analysisReport = await analyzePortfolio(req.userId);
    res.json(analysisReport);
  } catch (error) {
    console.error("AI Portfolio analysis error:", error);
    res.status(500).json({ success: false, message: "Failed to generate portfolio analysis" });
  }
});

// ==========================================
// 4b. RAZORPAY PAYMENT GATEWAY ROUTES
// ==========================================
app.use("/api/payments", paymentRoutes);

// ==========================================
// 5. AUTHENTICATION ROUTES
// ==========================================
app.post("/signup", Signup);
app.post("/login", Login);
app.post("/logout", Logout);
app.post("/verify", userVerification);

app.get("/api/ticker", (req, res) => {
  res.json(tickerService.getLatest());
});

app.get("/api/quotes", async (req, res) => {
  try {
    const rawSymbols = req.query.symbols || "";
    const symbols = rawSymbols ? rawSymbols.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const result = await tickerService.getQuotesForSymbols(symbols);
    res.json(result);
  } catch (err) {
    console.warn("[/api/quotes] Error:", err.message);
    res.json({ quotes: {}, rateLimitExhausted: true, message: "Error fetching quotes: " + err.message });
  }
});

// ==========================================
// 5b. DEPLOYMENT HEALTH CHECK ENDPOINT
// ==========================================
app.get(["/health", "/api/health"], (req, res) => {
  const dbState = mongoose.connection?.readyState;
  const dbStatus =
    dbState === 1 ? "connected" : dbState === 2 ? "connecting" : "disconnected";
  const rzpConfig = validateRazorpayConfig();

  const isHealthy = dbState === 1;
  return res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "UP" : "DEGRADED",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      razorpay: rzpConfig.isValid ? "configured_test_mode" : "misconfigured",
      websockets: "active",
    },
  });
});

// ==========================================
// 6. STATIC ASSET HOSTING & CATCH-ALL ROUTING
// ==========================================
const frontendDist = path.join(__dirname, "../frontend/dist");
const frontendBuild = path.join(__dirname, "../frontend/build");
const dashboardBuild = path.join(__dirname, "../dashboard/build");

// 6a. Trading Terminal (Dashboard) build hosting if available
if (fs.existsSync(dashboardBuild)) {
  app.use("/dashboard", express.static(dashboardBuild));
  app.use("/static", express.static(path.join(dashboardBuild, "static")));

  // Dedicated client-side routes for the trading terminal
  const dashboardRoutes = ["/dashboard", "/orders", "/holdings", "/positions", "/funds", "/apps"];
  dashboardRoutes.forEach((route) => {
    app.get(route, (req, res) => {
      res.sendFile(path.join(dashboardBuild, "index.html"));
    });
  });
  app.get(/^\/dashboard(?:\/.*)?$/, (req, res) => {
    res.sendFile(path.join(dashboardBuild, "index.html"));
  });
}

// 6b. Primary Frontend (Vite dist or CRA build)
const staticFrontendDir = fs.existsSync(frontendDist)
  ? frontendDist
  : fs.existsSync(frontendBuild)
  ? frontendBuild
  : fs.existsSync(dashboardBuild)
  ? dashboardBuild
  : null;

if (staticFrontendDir) {
  app.use(express.static(staticFrontendDir));

  // Catch-all route to support client-side routing (placed AFTER all API endpoints)
  // Uses regex /(.*)/ compatible with Express 5 path-to-regexp
  app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(staticFrontendDir, "index.html"));
  });
}

// ==========================================
// 7. SERVER INITIALIZATION
// ==========================================
server.listen(PORT, () => {
  console.log(`Zerodha Backend running on port ${PORT} with WebSocket support!`);

  // Validate Razorpay Payment Gateway configuration (Strictly Test Mode)
  const rzpConfig = validateRazorpayConfig();
  if (rzpConfig.isValid) {
    console.log(`[Razorpay] Successfully initialized in Test Mode (${rzpConfig.keyId})`);
  }

  tickerService.start(io);
  if (uri) {
    mongoose
      .connect(uri)
      .then(() => {
        console.log("Connected to MongoDB Atlas!");
        // Start background payment reconciliation scheduler
        startReconciliationScheduler();
      })
      .catch((err) => console.error("MongoDB Atlas connection error:", err));
  } else {
    console.warn("WARNING: MONGO_URL is not set in environment variables!");
  }
});

// Graceful shutdown hooks
const handleShutdown = () => {
  console.log("Shutting down gracefully...");
  stopReconciliationScheduler();
  process.exit(0);
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);