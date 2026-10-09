# 🚀 Zerodha Stock Trading & Broking Platform (MERN + Vite + React)

A full-stack replica of the **Zerodha Kite** stock trading platform and marketing ecosystem, featuring real-time market data, interactive stock technical charts, Level 2 market depth, portfolio management, UPI fund transfers, partner apps, and JWT authentication.

---

## 🌟 Key Architecture & Services

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Zerodha Platform                              │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
       ┌─────────────────────────────┼─────────────────────────────┐
       ▼                             ▼                             ▼
┌───────────────┐             ┌───────────────┐             ┌───────────────┐
│   Frontend    │             │   Dashboard   │             │    Backend    │
│  (Marketing)  │             │ (Kite Trading)│             │ (API & Auth)  │
│   Port 5173   │             │   Port 3000   │             │   Port 3001   │
└───────────────┘             └───────────────┘             └───────────────┘
```

| Service | Directory | Tech Stack | Port | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | `/frontend` | React 19, Vite 7, Bootstrap 5, React Router 7 | `5173` | Zerodha marketing portal, pricing, products, support, and JWT signup flow. |
| **Dashboard** | `/dashboard` | React 18, Zerodha Kite Theme, MUI, Graphify Engine | `3000` | Full trading interface (WatchList, Technicals, Depth, Holdings, Funds, Apps). |
| **Backend** | `/backend` | Node.js, Express, MongoDB Atlas, JWT, Twelve Data API | `3001` | REST API for auth, holdings, orders, positions, and live quotes. |

---

## ✨ Features Breakdown

### 1. 📈 Trading Dashboard (`http://localhost:3000/`)
* **✦ AI Portfolio Analyst (Gemini 2.5 Flash)**: Integrated quantitative analysis directly on Summary and Holdings pages. Computes portfolio health, outperformance/underperformance attribution, sector concentration, cash buffer risk metrics, and educational guidance. Includes seamless fallback to an internal rule engine if offline.
* **⚡ Real-Time WebSockets (Socket.IO)**: Real-time reactive updates for orders, holdings, positions, and funds with private authenticated room isolation (`user_${userId}`).
* **🛡️ Reliable Order Execution Engine**:
  * Server-authoritative validation for `BUY` / `SELL`, `MARKET` / `LIMIT`, `CNC` / `MIS`.
  * Dynamic virtual margin and holdings checks before execution.
  * Per-user async mutex serialization preventing race conditions and double-spending.
  * Idempotency protection against rapid repeated clicks or network duplicate submissions.
  * Interactive Limit Order cancellation (`PENDING` -> `CANCELLED`) with instant asset un-reservation.
* **Real-time TopBar Ticker**: Dynamic micro-ticks for **NIFTY 50**, **SENSEX**, and **NASDAQ 100** with positive/negative color highlights.
* **Dual Market WatchList**: Tab switching between Indian Equities (**NIFTY 50**) and US Tech Equities (**NASDAQ 100**) with live search and portfolio doughnut charts.
* **Interactive Stock Analytics Modal ("A" Button)**:
  * **Technicals**: Multi-timeframe selection (**1D, 1W, 1M, 1Y, ALL**), Candlestick & Line views, SMA 14, EMA 20 overlays, and Volume bars.
  * **Level 2 Market Depth**: 5-level Bids vs. Asks order book with live buyer/seller ratio bar.
  * **Fundamentals**: 52-Week High/Low dynamic indicator slider, Market Cap, P/E, EPS, Dividend Yield, Beta, and Circuit Limits.
* **Holdings (`/holdings`)**: Delivery (CNC) stocks, total portfolio investment, current value, live P&L, and vertical price distribution graph.
* **Positions (`/positions`)**: Intraday (MIS) day trades with real-time Mark-to-Market (MTM) calculations.
* **Funds & Margin (`/funds`)**: Instant UPI deposit modal (with `+₹1k` to `+₹50k` quick presets), withdrawal modal, and MCX Commodity account activation.
* **Zerodha Universe Apps (`/apps`)**: Partner products showcase (**Smallcase**, **Sensibull**, **Streak**, **Tijori**, **Quicko**, **Zerodha Fund House**, **Varsity**, **GoldenPi**) with category filter pills.

### 2. 🌐 Marketing & Auth Portal (`http://localhost:5173/`)
* **Landing Page (`/`)**: Hero section, trust metrics, pricing overview, and education links.
* **About (`/aboutpage`)**: Company history and leadership team.
* **Products (`/productpage`)**: Kite, Console, Coin, Kite Connect API, and Varsity Mobile.
* **Pricing (`/pricing`)**: ₹0 equity delivery, ₹20 intraday & F&O breakdown.
* **Support (`/supportpage`)**: Knowledgebase search and portal tickets.
* **Signup (`/signup`)**: Form validation, MongoDB account creation, and instant redirection into the trading dashboard (`http://localhost:3000/`).

---

## 🧪 Automated Testing

Execute the automated enhancement test suite:
```bash
cd backend
node tests/enhancements.test.js
```
Runs 14 automated assertions covering order execution, idempotency, insufficient funds rejection, sell limit validation, limit order placement & cancellation, mutex concurrency locking, WebSocket events, and Gemini AI analysis.

---

## 🚀 Quick Start (Running Locally)

### Prerequisites
* **Node.js**: v18+ installed
* **npm**: v9+ installed

### Starting the Applications (Separate Terminals)

#### 1. Backend (Terminal 1)
```bash
cd backend
npm install
npm start
# Server runs on http://localhost:3001
```

#### 2. Trading Dashboard (Terminal 2)
```bash
cd dashboard
npm install
npm start
# Dashboard runs on http://localhost:3000
```

#### 3. Frontend Portal (Terminal 3)
```bash
cd frontend
npm install
npm run dev
# Marketing website runs on http://localhost:5173
```

---

## 🔒 Environment Variables (`backend/.env`)

```env
PORT=3001
MONGO_URL=mongodb+srv://<username>:<password>@stock-trading-platform.q3m0ti9.mongodb.net/?appName=Stock-Trading-Platform
TOKEN_KEY=zerodha_secret_token_key_2026_secure
TWELVE_DATA_API_KEY=e3a7567d8f13431faf3c7e751e797817
```

---

## 🧪 Production Builds & Verification

To verify production compilation across all packages:

```bash
# Build Frontend (Vite)
cd frontend && npm run build

# Build Dashboard (React Scripts)
cd ../dashboard && npm run build
```

Both builds pass with **0 errors and 0 warnings**.

---

## 📖 Walkthrough Documentation
Detailed audit and verification logs are available in:
* [Root Walkthrough](file:///d:/Desktop/zerodha/WALKTHROUGH.md)
* [Backend Walkthrough](file:///d:/Desktop/zerodha/backend/WALKTHROUGH.md)
* [Dashboard Walkthrough](file:///d:/Desktop/zerodha/dashboard/WALKTHROUGH.md)
* [Frontend Walkthrough](file:///d:/Desktop/zerodha/frontend/WALKTHROUGH.md)
