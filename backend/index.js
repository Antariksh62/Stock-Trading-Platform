const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config();

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
const { UserModel } = require("./model/UserModel");
const { Signup, Login, Logout } = require("./controllers/AuthController");
const { userVerification } = require("./middlewares/AuthMiddleware");

const {
  processOrder,
  cancelOrder,
  getOrCreateUserFunds,
  matchPendingOrdersForStock,
  matchAllPendingOrders,
  setOrderExecutionDependencies,
  acquireUserLock,
  releaseUserLock,
} = require("./services/orderExecutionService");
const { analyzePortfolio } = require("./services/portfolioAnalystService");
const { tickerService } = require("./services/tickerService");

const PORT = process.env.PORT || 3001;
const uri = process.env.MONGO_URL;

const app = express();
const server = http.createServer(app);

// ==========================================
// CORS CONFIGURATION (Explicit Origin Allowlist)
// ==========================================
const configuredOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  process.env.FRONTEND_URL,
  process.env.DASHBOARD_URL,
  ...configuredOrigins,
].filter(Boolean);

const corsOriginDelegate = (origin, callback) => {
  // Allow non-browser agents (cURL, mobile apps, automated test suites, internal requests)
  if (!origin) {
    return callback(null, true);
  }
  if (defaultAllowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  return callback(new Error(`CORS policy violation: Origin '${origin}' is not authorized.`));
};

const corsOptions = {
  origin: corsOriginDelegate,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(bodyParser.json());

// ==========================================
// 1. WEBSOCKET SERVER (SOCKET.IO) WITH STRICT AUTH
// ==========================================
const io = new Server(server, {
  cors: corsOptions,
});

io.use((socket, next) => {
  let token = socket.handshake.auth?.token || socket.handshake.query?.token;

  // Fallback: Check cookies in socket handshake headers
  if (!token && socket.handshake.headers.cookie) {
    const rawCookies = socket.handshake.headers.cookie.split(";").map((c) => c.trim());
    const tokenCookie = rawCookies.find((c) => c.startsWith("token="));
    if (tokenCookie) {
      token = tokenCookie.substring(6);
    }
  }

  if (!token) {
    return next(new Error("Authentication error: No JWT provided"));
  }

  try {
    const tokenSecret = process.env.TOKEN_KEY;
    if (!tokenSecret) {
      return next(new Error("Authentication error: Server missing TOKEN_KEY configuration"));
    }
    const decoded = jwt.verify(token, tokenSecret);
    if (!decoded || !decoded.id) {
      return next(new Error("Authentication error: Malformed JWT payload"));
    }
    // Scope identity exclusively to verified user ID
    socket.userId = String(decoded.id);
    next();
  } catch (err) {
    return next(new Error(`Authentication error: ${err.message}`));
  }
});

io.on("connection", (socket) => {
  // Client can ONLY join their own verified room
  const userRoom = `user_${socket.userId}`;
  socket.join(userRoom);
  console.log(`[WebSocket] Authenticated client ${socket.id} joined personal room: ${userRoom}`);

  // Emit current market ticker state
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

// ==========================================
// STRICT AUTHENTICATION MIDDLEWARE
// ==========================================
const authHelper = (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required: No token provided.",
    });
  }

  const tokenSecret = process.env.TOKEN_KEY;
  if (!tokenSecret) {
    return res.status(500).json({
      success: false,
      message: "Server configuration error: TOKEN_KEY missing.",
    });
  }

  try {
    const decoded = jwt.verify(token, tokenSecret);
    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload.",
      });
    }
    // Set authenticated user ID strictly from verified token
    req.userId = String(decoded.id);
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

// ==========================================
// 2. DATA SEEDING ROUTES (Deprecated)
// ==========================================
app.get("/addHoldings", (req, res) => {
  res.json({ message: "Seeding disabled. Holdings are generated automatically when CNC buy orders are executed." });
});

app.get("/addPositions", (req, res) => {
  res.json({ message: "Seeding disabled. Positions are generated automatically when MIS buy orders are executed." });
});

// ==========================================
// 3. CORE PORTFOLIO & ORDER ROUTES
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
    const { name, qty, price, marketPrice, mode, product, orderType, limitPrice, idempotencyKey } = req.body;

    const result = await processOrder({
      userId: req.userId,
      name,
      qty,
      price,
      marketPrice,
      mode,
      product: product || "CNC",
      orderType: orderType || "MARKET",
      limitPrice: limitPrice || null,
      idempotencyKey: idempotencyKey || null,
    });

    if (result.success) {
      await broadcastUserUpdates(req.userId);
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
      await broadcastUserUpdates(req.userId);
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

// Trigger limit order matching sweep for a specific stock or all pending orders
app.post("/api/orders/match", authHelper, async (req, res) => {
  try {
    const { symbol, price } = req.body;
    let results = [];
    if (symbol && price) {
      const numPrice = Number(price);
      if (Number.isFinite(numPrice) && numPrice > 0) {
        await tickerService.updateQuote(symbol, numPrice);
        results = await matchPendingOrdersForStock(symbol, numPrice, io, broadcastUserUpdates);
      }
    } else {
      results = await matchAllPendingOrders(io, broadcastUserUpdates);
    }
    res.json({ success: true, count: results.length, executedOrders: results });
  } catch (error) {
    console.error("Error matching orders:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. REAL-TIME MARKET INDICES (Yahoo Finance Live Data)
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
  const day = ist.getDay();
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
// 5. FUNDS MANAGEMENT ROUTES
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

app.post("/api/funds/add", authHelper, async (req, res) => {
  try {
    const rawAmount = req.body.amount;
    const amount = Number(rawAmount);

    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
      return res.status(400).json({ success: false, message: "Amount must be a finite positive number up to ₹1,00,00,000" });
    }

    await acquireUserLock(req.userId);
    try {
      const funds = await getOrCreateUserFunds(req.userId);
      funds.availableCash = Number((funds.availableCash + amount).toFixed(2));
      funds.availableMargin = Number((funds.availableMargin + amount).toFixed(2));
      funds.payin = Number((funds.payin + amount).toFixed(2));
      funds.updatedAt = new Date();
      await funds.save();

      await broadcastUserUpdates(req.userId);
      res.json({ success: true, message: `₹${amount.toLocaleString()} added successfully via UPI`, funds });
    } finally {
      releaseUserLock(req.userId);
    }
  } catch (error) {
    console.error("Error adding funds:", error);
    res.status(500).json({ error: "Failed to add funds" });
  }
});

app.post("/api/funds/withdraw", authHelper, async (req, res) => {
  try {
    const rawAmount = req.body.amount;
    const amount = Number(rawAmount);

    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
      return res.status(400).json({ success: false, message: "Amount must be a finite positive number up to ₹1,00,00,000" });
    }

    await acquireUserLock(req.userId);
    try {
      // Atomic conditional update: only deduct if availableCash >= amount
      const updatedFunds = await FundsModel.findOneAndUpdate(
        { userId: req.userId, availableCash: { $gte: amount } },
        {
          $inc: { availableCash: -amount, availableMargin: -amount },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: "after" }
      );

      if (!updatedFunds) {
        const currentFunds = await getOrCreateUserFunds(req.userId);
        return res.status(400).json({
          success: false,
          message: `Withdrawal amount (₹${amount.toLocaleString()}) exceeds available cash (₹${currentFunds.availableCash.toLocaleString()})`,
        });
      }

      await broadcastUserUpdates(req.userId);
      res.json({ success: true, message: `Withdrawal request for ₹${amount.toLocaleString()} placed`, funds: updatedFunds });
    } finally {
      releaseUserLock(req.userId);
    }
  } catch (error) {
    console.error("Error withdrawing funds:", error);
    res.status(500).json({ error: "Failed to withdraw funds" });
  }
});

// ==========================================
// 6. AI PORTFOLIO ANALYST (GEMINI API)
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
// 7. AUTHENTICATION ROUTES
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
// 8. STATIC ASSET HOSTING & CATCH-ALL ROUTING
// ==========================================
const frontendDist = path.join(__dirname, "../frontend/dist");
const frontendBuild = path.join(__dirname, "../frontend/build");
const dashboardBuild = path.join(__dirname, "../dashboard/build");

// Trading Terminal (Dashboard) build hosting
if (fs.existsSync(dashboardBuild)) {
  app.use("/dashboard", express.static(dashboardBuild));
  app.use("/static", express.static(path.join(dashboardBuild, "static")));

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

// Primary Frontend (Vite dist or CRA build)
const staticFrontendDir = fs.existsSync(frontendDist)
  ? frontendDist
  : fs.existsSync(frontendBuild)
  ? frontendBuild
  : fs.existsSync(dashboardBuild)
  ? dashboardBuild
  : null;

if (staticFrontendDir) {
  app.use(express.static(staticFrontendDir));

  app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(staticFrontendDir, "index.html"));
  });
}

// ==========================================
// 9. SERVER INITIALIZATION & GRACEFUL SHUTDOWN
// ==========================================
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[PORT CONFLICT] Port ${PORT} is already in use by another process!`);
    console.error(`To free port ${PORT} on Windows PowerShell, run:`);
    console.error(`  Get-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess | Stop-Process -Force\n`);
  } else {
    console.error("[Server Error]:", err);
  }
  process.exit(1);
});

const startServer = async () => {
  try {
    console.log(`\nStarting Zerodha Unified Server on port ${PORT}...`);
    if (uri) {
      process.stdout.write("Connecting to MongoDB Atlas... ");
      await mongoose.connect(uri);
      console.log("Connected successfully!");
    } else {
      console.warn("WARNING: MONGO_URL is not set in environment variables!");
    }

    server.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`  ZERODHA TRADING PLATFORM IS LIVE & READY!`);
      console.log(`======================================================`);
      console.log(`  Marketing Portal:  http://localhost:${PORT}/`);
      console.log(`  Trading Terminal:  http://localhost:${PORT}/dashboard`);
      console.log(`  API / WebSocket:   http://localhost:${PORT}`);
      console.log(`======================================================\n`);

      // Wire dependencies for order execution & matching real-time broadcasts
      setOrderExecutionDependencies({ io, broadcastUserUpdates });

      // Connect ticker service price updates to order matching engine
      tickerService.setMatchingHandlers({
        onStockPriceUpdate: async (symbol, newPrice) => {
          await matchPendingOrdersForStock(symbol, newPrice, io, broadcastUserUpdates);
        },
        onPeriodicCheck: async () => {
          await matchAllPendingOrders(io, broadcastUserUpdates);
        },
      });

      tickerService.start(io);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Gracefully shutting down...`);
  try {
    if (tickerService.stop) tickerService.stop();
    server.close(() => {
      console.log("HTTP & WebSocket server closed.");
    });
    await mongoose.connection.close();
    console.log("MongoDB connection closed.");
    process.exit(0);
  } catch (err) {
    console.error("Error during graceful shutdown:", err);
    process.exit(1);
  }
};

process.on("unhandledRejection", (reason, promise) => {
  console.warn("[Process Warning - Unhandled Rejection]:", reason?.message || reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Process Error - Uncaught Exception]:", err?.message || err);
});

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Keepalive timer to guarantee the event loop never empties out
setInterval(() => {}, 1000 * 60 * 60);

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  server,
  io,
  broadcastUserUpdates,
  startServer,
};