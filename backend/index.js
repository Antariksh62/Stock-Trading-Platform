require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const { HoldingsModel } = require("./model/HoldingsModel");
const { PositionsModel } = require("./model/PositionsModel");
const { OrdersModel } = require("./model/OrdersModel");
const { FundsModel } = require("./model/FundsModel");
const { UserModel } = require("./model/UserModel");
const { Signup, Login, Logout } = require("./controllers/AuthController");
const { userVerification } = require("./middlewares/AuthMiddleware");

const { processOrder, cancelOrder, getOrCreateUserFunds } = require("./services/orderExecutionService");
const { analyzePortfolio } = require("./services/portfolioAnalystService");

const PORT = process.env.PORT || 3001;
const uri = process.env.MONGO_URL;

const app = express();
const server = http.createServer(app);

// 1. WebSocket Server (Socket.IO)
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"],
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

  socket.on("disconnect", () => {
    console.log(`[WebSocket] Client ${socket.id} disconnected`);
  });
});

// Helper to broadcast real-time state changes to a specific authenticated user room
const broadcastUserUpdates = async (userId) => {
  try {
    const room = `user_${userId}`;
    const [holdings, positions, orders, funds] = await Promise.all([
      HoldingsModel.find({ $or: [{ userId }, { userId: { $exists: false } }] }),
      PositionsModel.find({ $or: [{ userId }, { userId: { $exists: false } }] }),
      OrdersModel.find({ $or: [{ userId }, { userId: "demo_user" }] }).sort({ createdAt: -1 }),
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

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(bodyParser.json());

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
// 1. DATA SEEDING ROUTES (Legacy compatibility)
// ==========================================
app.get("/addHoldings", async (req, res) => {
  let tempHoldings = [
    { name: "RELIANCE", qty: 10, avg: 2450.0, price: 2890.5, net: "+17.98%", day: "+1.25%" },
    { name: "TCS", qty: 5, avg: 3500.0, price: 3950.2, net: "+12.86%", day: "-0.45%" },
    { name: "HDFCBANK", qty: 15, avg: 1420.0, price: 1680.0, net: "+18.31%", day: "+0.80%" },
    { name: "INFY", qty: 12, avg: 1380.0, price: 1540.75, net: "+11.65%", day: "-1.10%" },
    { name: "ICICIBANK", qty: 20, avg: 890.0, price: 1120.3, net: "+25.88%", day: "+0.65%" },
    { name: "BHARTIARTL", qty: 8, avg: 820.0, price: 1210.4, net: "+47.61%", day: "+2.15%" },
    { name: "HINDUNILVR", qty: 6, avg: 2400.0, price: 2520.0, net: "+5.00%", day: "-0.30%" },
    { name: "ITC", qty: 50, avg: 380.0, price: 435.6, net: "+14.63%", day: "+0.40%" },
    { name: "SBIN", qty: 25, avg: 580.0, price: 780.25, net: "+34.53%", day: "+1.80%" },
    { name: "LTIM", qty: 4, avg: 4800.0, price: 5120.0, net: "+6.67%", day: "-0.85%" },
  ];

  try {
    for (let item of tempHoldings) {
      await HoldingsModel.updateOne(
        { name: item.name },
        { $set: item },
        { upsert: true }
      );
    }
    res.send("Holdings seeded successfully");
  } catch (error) {
    console.error("Error seeding holdings:", error);
    res.status(500).send("Something went wrong");
  }
});

app.get("/addPositions", async (req, res) => {
  let tempPositions = [
    { product: "CNC", name: "EICHERMOT", qty: 2, avg: 3120.0, price: 3225.0, net: "+3.37%", day: "+0.85%", isLoss: false },
    { product: "MIS", name: "TATAMOTORS", qty: 22, avg: 720.0, price: 980.0, net: "+36.11%", day: "+1.15%", isLoss: false },
    { product: "MIS", name: "ADANIENT", qty: 6, avg: 2800.0, price: 3120.0, net: "+11.43%", day: "-1.50%", isLoss: true },
    { product: "CNC", name: "ADANIPORTS", qty: 12, avg: 1100.0, price: 1340.0, net: "+21.82%", day: "+0.90%", isLoss: false },
    { product: "MIS", name: "COALINDIA", qty: 30, avg: 380.0, price: 450.0, net: "+18.42%", day: "-0.40%", isLoss: true },
    { product: "CNC", name: "ONGC", qty: 45, avg: 210.0, price: 268.0, net: "+27.62%", day: "+1.30%", isLoss: false },
  ];

  try {
    for (let item of tempPositions) {
      await PositionsModel.updateOne(
        { name: item.name },
        { $set: item },
        { upsert: true }
      );
    }
    res.send("Positions seeded successfully");
  } catch (error) {
    console.error("Error seeding positions:", error);
    res.status(500).send("Something went wrong");
  }
});

// ==========================================
// 2. CORE PORTFOLIO & ORDER ROUTES
// ==========================================
app.get("/allHoldings", authHelper, async (req, res) => {
  try {
    const allHoldings = await HoldingsModel.find({
      $or: [{ userId: req.userId }, { userId: { $exists: false } }],
    });
    res.json(allHoldings);
  } catch (error) {
    console.error("Error fetching holdings:", error);
    res.status(500).json({ error: "Failed to fetch holdings" });
  }
});

app.get("/allPositions", authHelper, async (req, res) => {
  try {
    const allPositions = await PositionsModel.find({
      $or: [{ userId: req.userId }, { userId: { $exists: false } }],
    });
    res.json(allPositions);
  } catch (error) {
    console.error("Error fetching positions:", error);
    res.status(500).json({ error: "Failed to fetch positions" });
  }
});

app.get("/allOrders", authHelper, async (req, res) => {
  try {
    const allOrders = await OrdersModel.find({
      $or: [{ userId: req.userId }, { userId: "demo_user" }],
    }).sort({ createdAt: -1 });
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

app.post("/api/funds/add", authHelper, async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0" });
    }

    const funds = await getOrCreateUserFunds(req.userId);
    funds.availableCash = Number((funds.availableCash + amount).toFixed(2));
    funds.availableMargin = Number((funds.availableMargin + amount).toFixed(2));
    funds.payin = Number((funds.payin + amount).toFixed(2));
    funds.updatedAt = new Date();
    await funds.save();

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

    funds.availableCash = Number((funds.availableCash - amount).toFixed(2));
    funds.availableMargin = Number((funds.availableMargin - amount).toFixed(2));
    funds.updatedAt = new Date();
    await funds.save();

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
// 5. AUTHENTICATION ROUTES
// ==========================================
app.post("/signup", Signup);
app.post("/login", Login);
app.post("/logout", Logout);
app.post("/verify", userVerification);

// ==========================================
// 6. SERVER INITIALIZATION
// ==========================================
server.listen(PORT, () => {
  console.log(`Zerodha Backend running on port ${PORT} with WebSocket support!`);
  mongoose
    .connect(uri)
    .then(() => console.log("Connected to MongoDB Atlas!"))
    .catch((err) => console.error("MongoDB Atlas connection error:", err));
});