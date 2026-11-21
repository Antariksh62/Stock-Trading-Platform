# Zerodha Trading Platform

An end-to-end, full-stack paper-trading ecosystem inspired by **Zerodha Kite**, featuring a marketing website, an interactive trading dashboard, and a server-authoritative backend API with real-time WebSockets, automated risk controls, an AI-powered portfolio analyst, and a production-grade **Razorpay payment gateway** with dual-path wallet crediting and ACID ledger auditing.

---

> [!NOTE]
> **Educational & Paper-Trading Disclaimer**: This repository is an independent educational engineering project inspired by the Zerodha user experience. It is not affiliated with, endorsed by, or associated with Zerodha Broking Limited. All trading executions, portfolios, and funds are virtual simulations designed for educational paper-trading purposes.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
  - [Trading Dashboard](#1-trading-dashboard)
  - [Authentication & Backend Engine](#2-authentication--backend-engine)
  - [Real-Time WebSocket Pipeline](#3-real-time-websocket-pipeline)
  - [AI Portfolio Analyst (Gemini)](#4-ai-portfolio-analyst-gemini)
  - [Marketing Website](#5-marketing-website)
  - [Razorpay Payment Gateway & Wallet Engine](#6-razorpay-payment-gateway--wallet-engine-test-mode)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running the Applications](#running-the-applications)
- [End-to-End Workflows](#end-to-end-workflows)
  - [1. Authentication & Cross-Origin Handover](#1-authentication--cross-origin-handover)
  - [2. Market Data Flow & Rate-Limit Resilience](#2-market-data-flow--rate-limit-resilience)
  - [3. Order Placement, Concurrency Locking & Execution](#3-order-placement-concurrency-locking--execution)
  - [4. Limit Order Cancellation & Asset Un-reservation](#4-limit-order-cancellation--asset-un-reservation)
  - [5. AI Portfolio Diagnostics & Fallback](#5-ai-portfolio-diagnostics--fallback)
- [API Documentation](#api-documentation)
  - [Authentication Routes](#authentication-routes)
  - [Core Trading & Portfolio Routes](#core-trading--portfolio-routes)
  - [Funds Management Routes](#funds-management-routes)
  - [Market Data Routes](#market-data-routes)
  - [AI Analysis Route](#ai-analysis-route)
  - [WebSocket Events](#websocket-events)
- [Razorpay Payment Gateway Integration (Test Mode)](#razorpay-payment-gateway-integration-test-mode)
  - [Overview & Architecture](#razorpay-overview--architecture)
  - [Razorpay Test Mode – Payment Testing](#razorpay-test-mode--payment-testing)
  - [System Responsibilities & Security Model](#razorpay-system-responsibilities--security-model)
  - [Payment Lifecycle Flow (8-Step Execution)](#razorpay-payment-lifecycle-flow-8-step-execution)
  - [State Machine Transitions & Immutability](#razorpay-state-machine-transitions--immutability)
  - [API Endpoints Reference](#razorpay-api-endpoints-reference)
  - [Webhook Architecture & Enterprise Observability](#razorpay-webhook-architecture--enterprise-observability)
  - [Wallet Integrity & ACID Ledger Consistency](#razorpay-wallet-integrity--acid-ledger-consistency)
  - [Automated Background Reconciliation Service](#razorpay-automated-background-reconciliation-service)
  - [Safe Refund Handling & Concurrency Invariants](#razorpay-safe-refund-handling--concurrency-invariants)
  - [Environment Variables Configuration](#razorpay-environment-variables-configuration)
  - [Local Setup & Render Cloud Deployment](#razorpay-local-setup--render-cloud-deployment)
- [Screenshots & UI Showcase](#screenshots--ui-showcase)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Security Safeguards & Limitations](#security-safeguards--limitations)
- [Project Roadmap](#project-roadmap)
- [Contributing & License](#contributing--license)

---

## Overview

The **Zerodha Trading Platform** is structured as a decoupled multi-app architecture replicating the complete trading workflow:

1. **Marketing & Auth Portal (`/frontend`)**: A client-facing web application built with React 19, Vite, and Bootstrap, featuring product showcases, pricing tables, educational resources, and customer onboarding.
2. **Trading Dashboard (`/dashboard`)**: A web trading terminal built with React 18, React Router, Material UI icons, and Chart.js, recreating Zerodha Kite's single-page interface with dual-market watchlists, interactive technical charts, Level 2 market depth, order placement windows, holdings, positions, and fund management.
3. **Backend Service (`/backend`)**: A Node.js and Express REST API and Socket.IO WebSocket server backed by MongoDB Atlas, enforcing server-authoritative order validation, margin accounting, race-condition serialization, live market data caching, an AI-driven portfolio analyst, and a production-grade **Razorpay payment gateway** with dual-path wallet crediting, enterprise webhook observability, and automated reconciliation.

---

## Key Features

### 1. Trading Dashboard
- **Dual-Market Watchlist**: Tab switching between **NIFTY 50** Indian equities and **NASDAQ 100** US equities with instant client-side filtering and visual distribution doughnut charts.
- **TopBar Indices Ticker**: Real-time ticker displaying **NIFTY 50**, **SENSEX**, and **NASDAQ (QQQ)** with positive/negative color highlights, percent changes, and live market open/closed status calculation (IST market hours).
- **Interactive Stock Analytics Modal**:
  - **Technical Charts**: Multi-timeframe views (`1D`, `1W`, `1M`, `1Y`, `ALL`) with Line and Candlestick modes, SMA (14) and EMA (20) overlays, and dynamic volume histogram bars.
  - **Level 2 Market Depth**: 5-level Bids vs. Asks order book with live buyer/seller distribution ratio bar.
  - **Fundamental Metrics**: 52-Week High/Low range slider, Market Capitalization, P/E ratio, EPS, Dividend Yield, Beta, and Circuit Limits.
- **Order Placement Window**:
  - Order modes: **BUY** and **SELL**.
  - Product types: **CNC** (Cash & Carry for long-term equity delivery) and **MIS** (Margin Intraday Square-off).
  - Order types: **MARKET** (instant execution) and **LIMIT** (pending execution at target price).
  - Automatic margin estimation and insufficient balance warnings before submission.
- **Holdings Management (`/holdings`)**: Delivery holdings view with total investment, current value, total P&L, day P&L, and vertical price distribution bars.
- **Positions Tracking (`/positions`)**: Intraday MIS trades with real-time Mark-to-Market (MTM) calculations and net change indicators.
- **Order Book (`/orders`)**: Comprehensive order history displaying execution status (`FILLED`, `PENDING`, `REJECTED`, `CANCELLED`), order timestamps, rejection reasons, and interactive cancellation for pending limit orders.
- **Funds Management (`/funds`)**: Equity margin summary (available cash, used margin, opening balance), instant UPI deposit modal (with quick presets from `+₹1,000` to `+₹50,000`), withdrawal request modal, and commodity segment status.
- **Partner Ecosystem (`/apps`)**: Clean partner integration directory showcasing Zerodha ecosystem platforms (**Smallcase**, **Sensibull**, **Streak**, **Tijori**, **Quicko**, **Zerodha Fund House**, **Varsity by Zerodha**, **GoldenPi**) with official brand logos and category filter pills.

### 2. Authentication & Backend Engine
- **Account Creation & Login**: Secure registration with unique email validation, bcrypt password hashing (salt rounds: 12), and JWT cookie issuance.
- **Server-Authoritative Order Validation**:
  - Validates positive integer quantities, valid numerical prices, and allowed order types.
  - Prevents short-selling on CNC holdings (ensures user actually owns the shares before placing a delivery sell).
  - Verifies available cash/margin before order acceptance; rejects orders with clear, descriptive error reasons.
- **Per-User Concurrency Mutex**: In-memory async lock (`acquireUserLock` / `releaseUserLock`) per user ID to serialize order processing, eliminating race conditions and double-spending across rapid concurrent requests.
- **Idempotency Protection**: In-memory TTL cache (60 seconds) combined with database-level idempotency key checks to safely ignore duplicate network submissions or rapid button clicks.
- **Dynamic Account Initialization**: New user accounts initialize cleanly with ₹0 balance, requiring explicit UPI deposit simulation before trading.

### 3. Real-Time WebSocket Pipeline
- **Socket.IO Duplex Server**: Mounted directly onto the Node.js HTTP server on port 3001.
- **Room-Based Isolation**: Authenticated clients automatically join isolated private rooms (`user_${userId}`) based on their JWT or session identifier.
- **Reactive State Distribution**: When an order is executed or cancelled, or funds are modified, the backend automatically triggers `broadcastUserUpdates(userId)`, broadcasting refreshed `holdings_update`, `positions_update`, `orders_update`, and `funds_update` events exclusively to that user.
- **Global Ticker Updates**: Market indices updates are broadcast to all connected clients on interval ticks without client polling fan-out.

### 4. AI Portfolio Analyst (Gemini)
- **Google Gemini Integration**: Built with the official `@google/genai` SDK using the `gemini-2.5-flash` model.
- **Deterministic Math + AI Insights**: Computes factual quantitative metrics server-side (total invested, current portfolio value, net P&L, percentage returns, top gainers, top losers, sector allocation percentages, cash buffer ratio) before feeding them into Gemini.
- **Structured Output**: Produces five distinct diagnostic categories:
  1. *Portfolio Overview*
  2. *Top Gainers & Losers Attribution*
  3. *Sector & Asset Concentration*
  4. *Cash Buffer & Risk Observations*
  5. *Actionable Guidance & Next Steps*
- **Offline / Graceful Fallback**: If `GEMINI_API_KEY` is not provided or API rate limits are encountered, an internal deterministic rule engine generates comprehensive portfolio diagnostics without failing the user request.

### 5. Marketing Website
- Multi-page responsive marketing portal built with React 19, Vite, and Bootstrap 5:
  - **Home (`/`)**: Hero section, trust ecosystem metrics, pricing highlights, and educational links.
  - **Products (`/productpage`)**: Showcase for Kite, Console, Coin, Kite Connect API, and Varsity Mobile.
  - **Pricing (`/pricing`)**: Detailed brokerage breakdown (₹0 equity delivery, ₹20 intraday and F&O trades).
  - **About (`/aboutpage`)**: Company background and executive leadership team.
  - **Support (`/supportpage`)**: Knowledgebase search, ticket topics, and customer service portal.
  - **Signup (`/signup`)**: Onboarding form with live validation and automatic redirect into the trading dashboard.

### 6. Razorpay Payment Gateway & Wallet Engine (Test Mode)
- **Production-Grade Test Mode Simulation**: Educational paper-trading powered by Razorpay Test API keys (`rzp_test_...`) with startup configuration guards that immediately reject live credentials (`rzp_live_...`).
- **Dual-Path Wallet Crediting**: Synchronous checkout verification with timing-safe HMAC-SHA256 signatures plus asynchronous webhook event processing with idempotent convergence.
- **Enterprise Webhook Observability**: Dual visibility pipeline featuring structured JSON operational logging for Render Application Logs (`[RazorpayWebhook]`) alongside persistent MongoDB event audit records (`WebhookEventModel`).
- **ACID Ledger Consistency**: Multi-document MongoDB sessions with automatic transient write conflict retries (up to 5 attempts), user-scoped mutex locking, and atomic balance updates (`availableCash`, `availableMargin`, `payin`).
- **Safe Refund Management**: Controlled partial and full refunds with margin deficit avoidance, SDK v2.9.8 `fetchMultipleRefund` reconciliation, and atomic non-negative `payin` floor clamping.
- **Automated Background Reconciliation**: Periodic singleton scheduler running with atomic document leases (`reconciliationLockedUntil`) to auto-recover stale, interrupted, or out-of-order gateway transactions.
- **Deployment Health Monitoring**: Dedicated `/health` and `/api/health` probes returning service readiness for MongoDB, Razorpay Test Mode, and Socket.IO.

---

## System Architecture

```mermaid
flowchart TB
    Client([User / Web Browser])

    subgraph Frontends["Frontend Applications"]
        Marketing["Marketing Website<br/>React 19 + Vite 7<br/>Port 5173"]
        Dashboard["Trading Dashboard (Kite UI)<br/>React 18 + Create React App<br/>Port 3000"]
    end

    subgraph BackendEngine["Backend Application (Port 3001)"]
        ExpressApp["Express.js REST API"]
        SocketServer["Socket.IO Server<br/>(Private Rooms: user_userId)"]
        
        AuthModule["Auth Controller<br/>(bcryptjs + JWT)"]
        OrderEngine["Order Execution Engine<br/>(Mutex Locks + Idempotency)"]
        TickerEngine["Ticker Service<br/>(In-Memory Cache + 20s Polling)"]
        AIModule["Portfolio Analyst<br/>(@google/genai)"]
    end

    subgraph DataStorage["Persistence Layer"]
        MongoDB[("MongoDB Atlas Database<br/>Holdings, Positions, Orders, Funds, Users")]
    end

    subgraph ExternalServices["External Providers"]
        TwelveData["Twelve Data API<br/>(Stock Quotes Batch)"]
        YahooFinance["Yahoo Finance Feed<br/>(Nifty, Sensex, Nasdaq Live Fallback)"]
        GeminiAPI["Google Gemini 2.5 Flash API<br/>(AI Insights)"]
    end

    Client -->|Browse & Signup| Marketing
    Client -->|Trade & Monitor| Dashboard

    Marketing -->|POST /signup, POST /login| ExpressApp
    Dashboard -->|REST Requests| ExpressApp
    Dashboard <-->|Socket.IO Duplex| SocketServer

    ExpressApp --> AuthModule
    ExpressApp --> OrderEngine
    ExpressApp --> AIModule
    ExpressApp --> TickerEngine

    AuthModule --> MongoDB
    OrderEngine --> MongoDB
    AIModule --> MongoDB

    OrderEngine -.->|Trigger User Broadcast| SocketServer
    TickerEngine -.->|Broadcast Ticker Updates| SocketServer

    TickerEngine -->|Batch Quotes| TwelveData
    TickerEngine -->|Market Indices Fallback| YahooFinance
    AIModule -->|Portfolio Prompt| GeminiAPI
```

### Architectural Highlights & Request Flow
1. **Client Interaction**: Users explore the platform via the marketing portal (`localhost:5173`) and sign up. Upon successful authentication, they are redirected to the trading dashboard (`localhost:3000`) with cross-origin session synchronization.
2. **Order Submission**: When a user submits an order on the dashboard, an HTTP `POST /newOrder` request is sent with an idempotency key.
3. **Mutex Serialization**: The backend acquires an in-memory lock for that specific user, performs validation against the user's funds and holdings in MongoDB, updates or creates positions/holdings, and releases the lock.
4. **WebSocket Push**: Immediately upon transaction completion, `broadcastUserUpdates` fires over Socket.IO, updating the user's open dashboard tabs without requiring manual page refreshes.
5. **Market Data Resiliency**: The background `TickerService` polls market data on a 20-second schedule, updates its in-memory cache, and emits ticker changes to all connected clients.

---

## Technology Stack

| Category | Technology | Version | Purpose / Implementation Details |
| :--- | :--- | :--- | :--- |
| **Frontend (Marketing)** | React | `19.2.0` | Declarative UI library for the marketing portal |
| | Vite | `7.2.4` | Next-generation build tool and dev server (`localhost:5173`) |
| | Bootstrap | `5.3.8` | Responsive layout grid and component styling |
| | React Router DOM | `7.15.1` | Client-side routing for marketing pages |
| | FontAwesome | `7.2.0` | Vector icons for UI elements and navigation |
| **Frontend (Dashboard)** | React | `18.2.0` | Core UI engine for the trading terminal |
| | React Scripts (CRA) | `5.0.1` | Build tooling and development server (`localhost:3000`) |
| | React Router DOM | `6.22.2` | Single-page application routing (`/`, `/orders`, `/holdings`, etc.) |
| | Material UI Icons | `5.18.0` | Kite-styled action and navigation icons |
| | Chart.js & React-Chartjs-2 | `4.4.2` / `5.2.0` | Portfolio doughnut charts and technical candlestick/line charts |
| | Socket.IO Client | `4.8.4` | Real-time WebSocket connection to the backend server |
| **Backend & API** | Node.js | `>= 18.0` | JavaScript runtime environment |
| | Express | `5.2.1` | Fast, unopinionated REST API framework |
| | Socket.IO | `4.8.4` | Full-duplex WebSocket communication with private user rooms |
| | HTTP & Body Parser | `2.3.0` | HTTP server mounting and request payload parsing |
| **Database & ODM** | MongoDB Atlas | Cloud | Scalable NoSQL cloud database storage |
| | Mongoose | `9.10.3` | Object Data Modeling (ODM) library for MongoDB |
| **Authentication & Security** | bcryptjs | `3.0.3` | Password hashing using 12 salt rounds |
| | jsonwebtoken (JWT) | `9.0.3` | Stateless signed token generation and route protection |
| | Cookie Parser | `1.4.7` | HTTP cookie extraction and parsing |
| | In-Memory Mutex | Native ES6 Map | Asynchronous concurrency lock per user ID |
| **External Integrations** | Twelve Data API | REST | Batch stock quote lookup for equity watchlists |
| | Yahoo Finance Chart API | Public HTTP | Live market index backup feed for NIFTY, SENSEX, and NASDAQ |
| | Google Gemini API | `@google/genai 2.28.0` | AI-powered quantitative portfolio diagnostics (`gemini-2.5-flash`) |

---

## Repository Structure

```
zerodha/
├── README.md                          # Root project documentation
├── package-lock.json                  # Root package lockfile
├── backend/                           # Node.js / Express REST API & WebSocket server
│   ├── .env                           # Environment variables (private, git-ignored)
│   ├── index.js                       # Primary server entrypoint, routes & Socket.IO mounting
│   ├── package.json                   # Backend dependencies and scripts
│   ├── controllers/
│   │   └── AuthController.js          # Signup, Login, and Logout logic
│   ├── middlewares/
│   │   └── AuthMiddleware.js          # JWT verification middleware
│   ├── model/                         # Mongoose model definitions
│   │   ├── FundsModel.js              # User equity & margin accounts
│   │   ├── HoldingsModel.js           # CNC long-term delivery holdings
│   │   ├── OrdersModel.js             # Order history and execution logs
│   │   ├── PositionsModel.js          # MIS intraday open positions
│   │   └── UserModel.js               # User accounts with hashed credentials
│   ├── schemas/                       # Mongoose database schemas
│   │   ├── FundsSchema.js
│   │   ├── HoldingsSchema.js
│   │   ├── OrdersSchema.js
│   │   ├── PositionsSchema.js
│   │   └── UserSchema.js
│   ├── services/                      # Core business logic services
│   │   ├── orderExecutionService.js   # Mutex locking, idempotency & order validation
│   │   ├── portfolioAnalystService.js # Math metrics & Gemini AI portfolio diagnostics
│   │   └── tickerService.js           # Twelve Data batch polling & resilient fallback
│   ├── tests/                         # Automated integration test suites
│   │   ├── enhancements.test.js       # Order engine, concurrency & WebSocket tests
│   │   └── qa_e2e_full_audit.test.js  # End-to-end multi-user integration & security test
│   ├── scripts/
│   │   └── clean_seeds.js             # Database cleanup utility
│   └── util/
│       └── SecretToken.js             # JWT token creation helper
├── dashboard/                         # Trading Terminal (Kite UI, React 18)
│   ├── package.json                   # Dashboard dependencies and scripts
│   ├── public/                        # Public assets & HTML template
│   │   ├── index.html                 # Main template with "Stock Broking Platform" title
│   │   └── media/images/              # Partner app logos (Smallcase, Sensibull, Quicko, etc.)
│   └── src/
│       ├── index.js                   # Dashboard React DOM root entrypoint
│       ├── index.css                  # Kite layout, table styles, and theme overrides
│       ├── components/
│       │   ├── AIPortfolioAnalystModal.js # Interactive AI modal with metric cards
│       │   ├── Apps.js                # Zerodha Universe partner apps directory
│       │   ├── BuyActionWindow.js     # Kite buy/sell popup with margin estimation
│       │   ├── Dashboard.js           # Main routing shell (Watchlist + Page Content)
│       │   ├── Funds.js               # Equity funds overview, UPI deposit & withdraw modals
│       │   ├── GeneralContext.js      # Global reactive state provider & Socket.IO listener
│       │   ├── Holdings.js            # CNC holdings table with P&L and metrics
│       │   ├── Home.js                # Session sync and top-level wrapper
│       │   ├── Menu.js                # Top navigation bar and user profile dropdown
│       │   ├── Orders.js              # Order book table with interactive limit cancellation
│       │   ├── Positions.js           # MIS intraday positions table with MTM
│       │   ├── StockAnalyticsModal.js # Technical charts, Level 2 depth & fundamentals
│       │   ├── Summary.js             # Account overview with equity stats & AI entry button
│       │   ├── TopBar.js              # Dynamic live index ticker (NIFTY, SENSEX, NASDAQ)
│       │   └── WatchList.js           # Searchable dual-tab watchlist (Nifty 50 & Nasdaq 100)
│       ├── data/
│       │   └── data.js                # Static stock datasets (50 NIFTY + 50 NASDAQ stocks)
│       └── services/
│           └── socketService.js       # Centralized Socket.IO client instance and event bus
└── frontend/                          # Marketing Website (React 19 + Vite)
    ├── package.json                   # Frontend dependencies and scripts
    ├── index.html                     # Vite HTML entrypoint with "Stock Broking Platform" title
    ├── vite.config.js                 # Vite bundler configuration
    ├── public/                        # Static marketing media
    │   └── media/images/              # Zerodha logos, illustrations, and partner badges
    └── src/
        ├── main.jsx                   # Vite React root & React Router configuration
        ├── App.jsx                    # Root marketing shell
        └── landing_page/              # Sectioned marketing components
            ├── Navbar.jsx             # Top branding navigation
            ├── Footer.jsx             # Global footer with disclaimers
            ├── home/                  # Landing page hero, pricing, and education
            ├── products/              # Kite, Console, Coin, and Universe partner platforms
            ├── pricing/               # Brokerage rates and charges calculator
            ├── about/                 # Company background and leadership
            ├── support/               # Portal ticket system and search
            └── signup/                # User registration form with instant redirect
```

---

## Getting Started

### Prerequisites
Before running the platform, ensure you have the following installed on your machine:
- **Node.js**: `v18.0.0` or higher (recommended: `v20.x` LTS)
- **npm**: `v9.0.0` or higher
- **MongoDB**: A free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster connection URI or a local MongoDB instance running on `mongodb://localhost:27017/zerodha`.

---

### Installation

Clone the repository and install dependencies for all three packages:

```bash
# Clone the repository
git clone https://github.com/Antariksh62/Stock-Trading-Platform.git
cd Stock-Trading-Platform

# 1. Install Backend Dependencies
cd backend
npm install

# 2. Install Dashboard Dependencies
cd ../dashboard
npm install

# 3. Install Frontend Dependencies
cd ../frontend
npm install
```

---

### Environment Variables

The backend application requires configuration via an environment file. Create a `.env` file in the `backend/` directory:

```bash
# In the backend directory
touch .env
```

Add the following environment variable template to `backend/.env`:

```env
# Server Port Configuration
PORT=3001
NODE_ENV=development

# MongoDB Connection String (Atlas URI or local instance)
MONGO_URL=mongodb+srv://<USERNAME>:<PASSWORD>@<CLUSTER-URL>/<DATABASE-NAME>?retryWrites=true&w=majority

# JWT Token Secret for Auth Signatures
TOKEN_KEY=your_secure_jwt_secret_key_here

# Allowed CORS Origins (comma-separated for multi-environment deployments)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
FRONTEND_URL=http://localhost:5173
DASHBOARD_URL=http://localhost:3000

# External Market Data API Key (Twelve Data - Free Tier: 8 credits/min)
# Optional: If omitted or rate-limited, the backend automatically uses cached/fallback data.
TWELVE_DATA_API_KEY=your_twelve_data_api_key_here

# Google Gemini API Key for AI Portfolio Diagnostics
# Optional: If omitted or invalid, the backend uses a built-in deterministic rule engine.
GEMINI_API_KEY=your_gemini_api_key_here

# Graphify Knowledge Graph & Visual Chart Engine
# Optional: Path to knowledge graph artifacts and structural codebase mapping.
GRAPHIFY_ENABLED=true
GRAPHIFY_PATH=../graphify-out
```

> [!IMPORTANT]
> Neither the `frontend` nor `dashboard` applications require `.env` files for standard local development. They default automatically to `http://localhost:3001` for API requests and WebSockets. A ready-to-use template is also available at [`backend/.env.example`](file:///d:/Desktop/zerodha/backend/.env.example).

---

### Running the Applications

To run the full platform locally, open three separate terminal windows:

#### Terminal 1: Backend Service
```bash
cd backend
npm start
```
- Starts the Express REST API and Socket.IO server on **`http://localhost:3001`**.
- Verifies MongoDB connection (look for `Connected to MongoDB Atlas!` in the terminal).

#### Terminal 2: Trading Dashboard
```bash
cd dashboard
npm start
```
- Starts the trading interface on **`http://localhost:3000`**.
- Automatically opens your browser at `http://localhost:3000`.

#### Terminal 3: Marketing Website
```bash
cd frontend
npm run dev
```
- Starts the marketing portal on **`http://localhost:5173`**.
- Open your browser at `http://localhost:5173`.

---

## End-to-End Workflows

### 1. Authentication & Cross-Origin Handover
1. A user visits `http://localhost:5173/signup` and fills in their username, email, and password.
2. The frontend sends a `POST http://localhost:3001/signup` request.
3. The backend validates email uniqueness, hashes the password with bcrypt, creates the user record in MongoDB, and issues a JWT token.
4. The user is redirected to the trading dashboard (`http://localhost:3000/?token=<JWT>&user=<USER_JSON>`).
5. The dashboard's [`Home.js`](file:///d:/Desktop/zerodha/dashboard/src/components/Home.js) captures the query parameters, synchronizes them into `localStorage`, strips the tokens from the browser URL bar via `window.history.replaceState`, and initializes the authenticated trading session.

### 2. Market Data Flow & Rate-Limit Resilience
```
Twelve Data API (Every 20s) ──► TickerService (In-Memory Cache) ──► Socket.IO Broadcast
                                      │
              (Fallback if 429/Error) └──► Yahoo Finance Live Indices Chart
```
1. `tickerService.js` maintains a server-side timer running every 20 seconds (3 calls per minute, well below the free tier 8 credits/minute limit).
2. It requests a batch quote for major indices (`QQQ`, `NIFTY`, `SENSEX`).
3. If Twelve Data returns a rate-limit error (`429`) or daily quota exhaustion, the service automatically falls back to Yahoo Finance public chart endpoints (`^NSEI`, `^BSESN`, `^NDX`) to compute real-time index changes.
4. The cached result is emitted over Socket.IO (`ticker_update`) to all connected dashboard instances.

### 3. Order Placement, Concurrency Locking & Execution
1. The user clicks **BUY** or **SELL** on any stock in the Watchlist, opening [`BuyActionWindow.js`](file:///d:/Desktop/zerodha/dashboard/src/components/BuyActionWindow.js).
2. The user configures quantity, product (**CNC** delivery or **MIS** intraday), order type (**MARKET** or **LIMIT**), and clicks **Submit**.
3. A unique `idempotencyKey` is generated on the client and sent with the payload to `POST /newOrder`.
4. In `orderExecutionService.js`:
   - Checks the in-memory cache and MongoDB for the `idempotencyKey`. If already processed, returns the existing record immediately.
   - Acquires the per-user mutex lock (`acquireUserLock(userId)`).
   - Validates quantity, price, and checks user funds from `FundsModel`.
   - **For BUY**: Checks if `availableCash >= totalCost`. If insufficient, marks the order as `REJECTED` with a detailed reason. If sufficient, deducts virtual cash and margin. For `MARKET`, creates or averages the holding in `HoldingsModel` (for CNC) or `PositionsModel` (for MIS). For `LIMIT` where the limit price is below market, sets status to `PENDING`.
   - **For SELL**: If CNC, verifies that the user actually owns sufficient shares in `HoldingsModel`. If not owned, rejects the order. If owned, decrements/removes the holding and credits cash back to the user's funds.
   - Releases the mutex lock in a `finally` block.
5. Calls `broadcastUserUpdates(userId)` to push updated holdings, positions, orders, and funds directly to the user's browser over Socket.IO.

### 4. Limit Order Cancellation & Asset Un-reservation
1. A user navigates to the **Orders** tab (`/orders`) where pending limit orders display an interactive **Cancel** button.
2. Clicking Cancel sends a `POST /cancelOrder/:id` request.
3. The backend validates that the order is in `PENDING` status.
4. Changes the status to `CANCELLED` and automatically un-reserves the virtual funds previously committed to the order, restoring `availableCash` and `availableMargin`.
5. Emits real-time WebSocket updates to immediately update the Orders and Funds views.

### 5. AI Portfolio Diagnostics & Fallback
1. From the Dashboard Summary or Holdings page, the user clicks **✦ AI Portfolio Analyst**.
2. A request is sent to `POST /api/portfolio/analyze`.
3. In `portfolioAnalystService.js`:
   - Fetches the user's actual holdings and funds from MongoDB.
   - Computes deterministic metrics: total investment, current valuation, total P&L, P&L percentage, top gainers, top losers, sector weight breakdown, and liquid cash ratio.
   - If the user has 0 holdings, immediately returns an accurate empty-portfolio report without unnecessary external API calls.
   - If holdings exist and `GEMINI_API_KEY` is present, formats a structured prompt and queries Google Gemini (`gemini-2.5-flash`).
   - If Gemini is unreachable, times out, or no key is configured, an internal deterministic rule engine generates comprehensive, actionable portfolio analysis.
4. The dashboard renders the diagnostic report inside [`AIPortfolioAnalystModal.js`](file:///d:/Desktop/zerodha/dashboard/src/components/AIPortfolioAnalystModal.js) with metric badges, risk cards, and actionable suggestions.

---

## API Documentation

The backend service runs on `http://localhost:3001` and provides the following REST endpoints:

### Authentication Routes

#### `POST /signup`
- **Purpose**: Registers a new user account.
- **Auth Required**: No.
- **Request Body**:
  ```json
  {
    "username": "trader_jane",
    "email": "jane@example.com",
    "password": "SecurePassword123"
  }
  ```
- **Response Shape (`201 Created`)**:
  ```json
  {
    "message": "User signed up successfully",
    "success": true,
    "user": { "id": "670...", "username": "trader_jane", "email": "jane@example.com" },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
  ```
- **Error Cases**: `400` if required fields are missing or email is already registered; `500` on internal error.

#### `POST /login`
- **Purpose**: Authenticates an existing user and issues a JWT token.
- **Auth Required**: No.
- **Request Body**:
  ```json
  {
    "email": "jane@example.com",
    "password": "SecurePassword123"
  }
  ```
- **Response Shape (`200 OK`)**:
  ```json
  {
    "message": "User logged in successfully",
    "success": true,
    "user": { "id": "670...", "username": "trader_jane", "email": "jane@example.com" },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
  ```
- **Error Cases**: `400` for missing fields; `401` for incorrect credentials.

#### `POST /verify`
- **Purpose**: Verifies an active JWT session token.
- **Auth Required**: Yes (Bearer token in `Authorization` header or `token` cookie).
- **Response Shape (`200 OK`)**:
  ```json
  {
    "status": true,
    "user": "trader_jane",
    "userId": "670...",
    "email": "jane@example.com"
  }
  ```

---

### Core Trading & Portfolio Routes

#### `GET /allHoldings`
- **Purpose**: Retrieves all CNC equity delivery holdings for the authenticated user.
- **Auth Required**: Yes (or fallback to `userId` query parameter).
- **Response Shape (`200 OK`)**:
  ```json
  [
    {
      "_id": "670...",
      "userId": "670...",
      "name": "RELIANCE",
      "qty": 10,
      "avg": 2890.50,
      "price": 2890.50,
      "net": "+0.00%",
      "day": "+0.00%"
    }
  ]
  ```

#### `GET /allPositions`
- **Purpose**: Retrieves open MIS intraday positions for the authenticated user.
- **Auth Required**: Yes.
- **Response Shape (`200 OK`)**:
  ```json
  [
    {
      "_id": "670...",
      "userId": "670...",
      "name": "TCS",
      "qty": 5,
      "avg": 3950.20,
      "price": 3950.20,
      "product": "MIS",
      "net": "+0.00%",
      "day": "+0.00%",
      "isLoss": false
    }
  ]
  ```

#### `GET /allOrders`
- **Purpose**: Retrieves all orders placed by the user, sorted in descending order by creation date.
- **Auth Required**: Yes.
- **Response Shape (`200 OK`)**: Array of order objects including `status`, `rejectionReason`, `orderType`, `mode`, `product`, etc.

#### `POST /newOrder`
- **Purpose**: Places a buy or sell order with server-authoritative validation, mutex locking, and margin deduction.
- **Auth Required**: Yes.
- **Request Body**:
  ```json
  {
    "name": "INFY",
    "qty": 15,
    "price": 1540.75,
    "mode": "BUY",
    "product": "CNC",
    "orderType": "MARKET",
    "limitPrice": null,
    "idempotencyKey": "order_uuid_17288..."
  }
  ```
- **Response Shape (`201 Created`)**:
  ```json
  {
    "success": true,
    "status": "FILLED",
    "message": "Order FILLED: BUY 15 INFY @ ₹1540.75",
    "order": { "_id": "670...", "status": "FILLED", "name": "INFY", "qty": 15, "price": 1540.75 }
  }
  ```
- **Error Cases**: `400 Bad Request` if insufficient funds or holdings, or invalid parameters. Returns `{ "success": false, "status": "REJECTED", "message": "..." }`.

#### `POST /cancelOrder/:id` (also accepts `PUT`)
- **Purpose**: Cancels a pending limit order and releases reserved funds back to the user account.
- **Auth Required**: Yes.
- **Response Shape (`200 OK`)**:
  ```json
  {
    "success": true,
    "message": "Order #abc123 CANCELLED successfully",
    "order": { "_id": "670...", "status": "CANCELLED" }
  }
  ```

---

### Funds Management Routes

#### `GET /api/funds`
- **Purpose**: Retrieves the user's current equity margin balance and account funds.
- **Auth Required**: Yes.
- **Response Shape (`200 OK`)**:
  ```json
  {
    "userId": "670...",
    "availableMargin": 75000.00,
    "usedMargin": 25000.00,
    "availableCash": 75000.00,
    "openingBalance": 0.00,
    "payin": 100000.00,
    "span": 0.00,
    "deliveryMargin": 25000.00
  }
  ```

#### `POST /api/funds/add`
- **Purpose**: Simulates an instant UPI fund deposit.
- **Auth Required**: Yes.
- **Request Body**: `{ "amount": 25000 }`
- **Response Shape (`200 OK`)**:
  ```json
  {
    "success": true,
    "message": "₹25,000 added successfully via UPI",
    "funds": { "availableCash": 100000.00, "availableMargin": 100000.00, "payin": 100000.00 }
  }
  ```

#### `POST /api/funds/withdraw`
- **Purpose**: Simulates a fund withdrawal back to the user's bank account.
- **Auth Required**: Yes.
- **Request Body**: `{ "amount": 10000 }`
- **Response Shape (`200 OK`)**: `{ "success": true, "message": "Withdrawal request placed", "funds": { ... } }`

---

### Market Data Routes

#### `GET /api/indices`
- **Purpose**: Returns live market status (IST) and index quotes for NIFTY 50, SENSEX, and NASDAQ 100.
- **Auth Required**: No.
- **Response Shape (`200 OK`)**:
  ```json
  {
    "isMarketOpen": false,
    "lastUpdated": "2026-10-13T18:00:00.000Z",
    "indices": {
      "nifty": { "name": "NIFTY 50", "points": 22520.45, "percent": "+1.30%", "isDown": false },
      "sensex": { "name": "SENSEX", "points": 72472.33, "percent": "+1.23%", "isDown": false },
      "nasdaq": { "name": "NASDAQ 100", "points": 20883.15, "percent": "+0.51%", "isDown": false }
    }
  }
  ```

#### `GET /api/ticker`
- **Purpose**: Returns the latest cached market data from the background `TickerService`.
- **Auth Required**: No.

#### `GET /api/quotes?symbols=RELIANCE,TCS,INFY`
- **Purpose**: Returns batch stock quotes with in-memory caching and rate-limit guardrails.
- **Auth Required**: No.

---

### AI Analysis Route

#### `POST /api/portfolio/analyze`
- **Purpose**: Triggers quantitative calculations and Gemini AI diagnostic evaluation for the user's portfolio.
- **Auth Required**: Yes.
- **Response Shape (`200 OK`)**:
  ```json
  {
    "success": true,
    "source": "gemini-2.5-flash",
    "timestamp": "2026-10-13T18:00:00.000Z",
    "metrics": {
      "totalInvestment": 43250.00,
      "totalCurrentValue": 45120.00,
      "totalPnL": 1870.00,
      "pnlPercent": 4.32,
      "holdingsCount": 3,
      "availableCash": 56750.00,
      "cashRatioPercent": 55.71,
      "topHolding": { "name": "RELIANCE", "weightPercent": 48.2 },
      "sectorBreakdown": { "Energy & Conglomerate": 48.2, "Information Technology": 51.8 }
    },
    "analysis": {
      "overview": "Your portfolio demonstrates a healthy unrealized profit of +4.32%...",
      "topGainersLosers": "RELIANCE is leading gains (+₹1,240.00), while INFY is flat...",
      "concentrationAnalysis": "Significant concentration in IT and Energy sectors...",
      "riskObservations": "Strong liquidity buffer with 55.7% of total capital held in cash...",
      "actionableSuggestions": "Consider scaling into defensive consumer goods (FMCG) or banking..."
    },
    "disclaimer": "This AI-assisted portfolio review is generated for informational and paper-trading practice purposes only..."
  }
  ```

---

### WebSocket Events

The Socket.IO server communicates over WebSocket using the following events:

| Event Name | Direction | Payload Description |
| :--- | :--- | :--- |
| `connection` | Client ➔ Server | Client connects with `{ auth: { token, userId } }` and joins room `user_${userId}`. |
| `ticker_update` | Server ➔ All Clients | Global index ticker updates containing NIFTY, SENSEX, and NASDAQ live metrics. |
| `holdings_update` | Server ➔ User Room | Array of updated CNC holdings immediately after an order fill. |
| `positions_update`| Server ➔ User Room | Array of updated MIS intraday positions after an intraday order fill. |
| `orders_update` | Server ➔ User Room | Array of updated orders when an order is created, filled, or cancelled. |
| `funds_update` | Server ➔ User Room | Updated funds object reflecting margin changes, deposits, or order costs. |

---

## Razorpay Payment Gateway Integration (Test Mode)

A production-grade, secure, and distributed-safe payment gateway integration using the official **Razorpay Node.js SDK**, configured strictly in **Test Mode** (`rzp_test_...`) for educational paper-trading.

> [!IMPORTANT]
> **Educational Simulation & Safety Notice**: This platform is an educational paper-trading simulation. Real-money payouts and brokerage clearing are strictly disabled. All transactions use Razorpay Test credentials (`rzp_test_...`). Real-world credentials or `rzp_live_` keys are automatically rejected at server startup.

### Razorpay Overview & Architecture

The Razorpay integration provides an end-to-end simulated funds deposit and withdrawal infrastructure replicating real-world brokerage account funding:
1. **Interactive Wallet Funding**: Traders deposit funds directly inside the Trading Dashboard (`dashboard/src/components/Funds.js`) using the official Razorpay Checkout modal with pre-filled test payment instruments (UPI, Netbanking, Cards).
2. **Server-Authoritative Order Generation**: Deposits initiate via `POST /api/payments/create-order`, converting user rupee amounts into integer paise and creating an authoritative order with Razorpay.
3. **Dual-Path Resolution**: Combines client-side checkout signature verification (`POST /api/payments/verify`) with asynchronous webhook event delivery (`POST /api/webhooks/razorpay`) to ensure funds are credited reliably even if client network connections drop.
4. **Multi-Document ACID Ledger**: Wallet balance updates are executed within atomic MongoDB transactions alongside immutable dual-entry ledger records in `WalletTransactionModel`.
5. **Autonomous Self-Healing**: A background reconciliation worker periodically audits pending or uncredited transactions against Razorpay's authoritative gateway records, resolving discrepancies without human intervention.
6. **Controlled Refund Protocol**: Provides partial and full refund capabilities with margin deficit protection, preventing traders from forcing their accounts into negative balances.

---

### Razorpay Test Mode – Payment Testing

**Test Card Details**

| Field | Value |
|---|---|
| Card Network | Mastercard |
| Card Number | `5555 5100 0008 1006` |
| Card Type | Credit |
| Category | Business |
| CVV | Any random CVV, if supported |
| Expiry | Any future date, if supported |
| OTP | Follow the documented Razorpay test authentication flow |

**More Razorpay Test Cards:**  
[Razorpay Official Test Card Details](https://razorpay.com/docs/payments/payments/test-card-details)

#### Payment Testing Instructions

1. Run the dashboard and navigate to Funds / Add Funds.
2. Enter the desired deposit amount.
3. Select Pay with Razorpay.
4. Select Card in the Razorpay Checkout window.
5. Enter the test card details listed above.
6. Complete the simulated authentication process as instructed by Razorpay.

> This project uses Razorpay Test Mode for demonstration purposes. No real money is deducted when valid test credentials and Test Mode API keys are used.

---

### Razorpay System Responsibilities & Security Model

The payment architecture divides responsibilities across platform subsystems to enforce defense-in-depth:

| Subsystem | Primary Responsibilities | Security Controls Enforced |
| :--- | :--- | :--- |
| **Frontend Terminal** (`/dashboard`) | Renders deposit modal, triggers Checkout script (`checkout.js`), captures payment metadata (`payment_id`, `order_id`, `signature`), renders ledger history. | Exposes public Test Key ID only (`REACT_APP_RAZORPAY_KEY_ID`); zero secret keys present in bundle. In-flight double-click submission lock. |
| **Backend API Server** (`/backend`) | Order creation, JWT session authentication, timing-safe cryptographic signature validation, Socket.IO updates. | Validates integer limits (₹100–₹1,00,000); computes HMAC-SHA256 signatures server-side via `crypto.timingSafeEqual`; rejects spoofed user identities. |
| **Razorpay Gateway** (Test Mode) | Secure modal checkout UI, simulated bank processing, payment capture, webhook event dispatching, refund processing. | Enforces Test Mode keys (`rzp_test_...`); generates cryptographically signed payment responses and webhook headers (`x-razorpay-signature`). |
| **MongoDB Atlas** (Replica Set) | Persistent document storage across `payments`, `funds`, `wallet_transactions`, and `webhook_events`. | Multi-document ACID transactions with 5-attempt retry loops; unique compound indexes preventing duplicate records and replay attacks. |
| **Webhook Processing Engine** | Ingestion of asynchronous lifecycle notifications (`/api/webhooks/razorpay`), raw buffer parsing, deduplication. | Raw request body buffer preservation (`express.raw`); strict HMAC verification; idempotent event delivery acknowledgement (`HTTP 200 { duplicate: true }`). |
| **Wallet Ledger System** | Dual-entry accounting of balance adjustments, mutex serialization, margin deficit avoidance. | In-memory per-user async mutex (`acquireUserLock`); atomic balance `$inc` operations; payin floor clamping at ₹0. |

---

### Razorpay Payment Lifecycle Flow (8-Step Execution)

```mermaid
sequenceDiagram
    autonumber
    actor User as Trader (Frontend)
    participant Modal as Razorpay Checkout Modal
    participant API as Express API Server
    participant RZP as Razorpay Gateway (Test)
    participant Service as Central Payment Service
    participant DB as MongoDB Atlas (ACID)
    participant Socket as Socket.IO Server

    User->>API: 1. POST /api/payments/create-order (amount in INR)
    API->>DB: 2. Validate amount & persist Payment (status: CREATED)
    API->>RZP: 2b. razorpay.orders.create({ amount, currency: "INR" })
    RZP-->>API: Return order_id
    API-->>User: 3. Return { orderId, amount, keyId }
    User->>Modal: 3b. Open Razorpay Checkout (Test Mode)
    Modal->>RZP: 4. Process Test Payment (UPI / Netbanking / Card)
    RZP-->>Modal: Return { payment_id, order_id, signature }
    
    par Dual-Path Authoritative Resolution
        Modal->>API: 5. POST /api/payments/verify
        API->>API: 5b. Verify HMAC-SHA256 signature (timingSafeEqual)
        API->>RZP: 5c. Fetch live payment status
        API->>Service: 7. processCapturedPayment()
        Service->>DB: 7b. ACID Transaction (Increment Funds & Add Ledger Tx)
        Service->>Socket: 8. Emit funds_update to user room
        API-->>User: HTTP 200 { status: "CREDITED", walletCredited: true }
    and Asynchronous Webhook Notification
        RZP->>API: 6. POST /api/webhooks/razorpay (payment.captured)
        API->>API: 6b. Verify X-Razorpay-Signature (Raw Body HMAC)
        API->>DB: 6c. Deduplicate & Persist Webhook Event in webhook_events
        API->>Service: 7. processCapturedPayment() (Idempotent check)
        Service-->>API: Verified (Already credited or newly credited)
        API-->>RZP: HTTP 200 OK
    end
    Socket-->>User: 8b. Real-time UI balance update via WebSocket
```

#### Detailed Step-by-Step Walkthrough:
1. **User Initiates Wallet Deposit**: The trader selects a deposit amount in INR (minimum ₹100, maximum ₹1,00,000) inside the Funds tab.
2. **Backend Order Generation**: The backend validates user session JWT, converts rupees to integer paise (`amount * 100`), checks idempotency keys, persists a `Payment` record in `CREATED` state, and invokes `razorpay.orders.create()`.
3. **Frontend Opens Razorpay Checkout**: The client receives the generated `order_id` and launches the checkout modal dynamically loaded via `https://checkout.razorpay.com/v1/checkout.js`.
4. **Razorpay Processes Payment**: The trader selects a simulated payment instrument in Test Mode (e.g. Success UPI / Netbanking).
5. **Backend Verifies Payment Signature**: Upon modal completion, the frontend transmits `razorpay_payment_id`, `razorpay_order_id`, and `razorpay_signature`. The backend validates the HMAC-SHA256 signature using `crypto.timingSafeEqual` and confirms payment status with the Razorpay API.
6. **Webhooks Independently Notify Backend**: In parallel, Razorpay emits an asynchronous `payment.captured` webhook to `/api/webhooks/razorpay`.
7. **Authoritative Wallet Crediting**: Centralized `processCapturedPayment()` uses multi-document ACID transactions with per-user mutex locking to atomically increment `availableCash`, `availableMargin`, and `payin`, and record an immutable ledger entry.
8. **Real-Time Notification & History**: Following successful transaction commit, Socket.IO broadcasts `funds_update` to the user's private room (`user_${userId}`), refreshing dashboard balances instantly without page reloads.

#### Safe Convergence & Race Condition Handling:
- **Webhook Arrives First**: The webhook credits the wallet and sets payment status to `CREDITED`. When the frontend verification request subsequently arrives, it recognizes `status: "CREDITED"` and returns success immediately without double-crediting.
- **Frontend Verification Arrives First**: The checkout verification credits the wallet and sets status to `CREDITED`. The subsequent webhook detects the `CREDITED` state or unique ledger index conflict and acknowledges with `HTTP 200` without creating a second ledger record.
- **Simultaneous Arrival Race**: Handled via in-memory user mutex (`acquireUserLock`) and atomic MongoDB update filter `{ _id: payment._id, status: "CAPTURED" }`. Exactly one request executes the credit; the second gracefully receives the confirmed balance.
- **Out-of-Order Webhooks**: Delayed `payment.authorized` or `payment.failed` webhooks are blocked from overwriting payments that have already achieved terminal `CREDITED` status.

---

### Razorpay State Machine Transitions & Immutability

Payments transition strictly forward through an immutable state machine:

```mermaid
stateDiagram-v2
    [*] --> CREATED: Order Created (create-order)
    CREATED --> PENDING: payment.authorized (Awaiting Capture)
    CREATED --> CAPTURED: payment.captured (Gateway Confirmed)
    PENDING --> CAPTURED: payment.captured (Gateway Confirmed)
    CREATED --> FAILED: payment.failed / Expired
    PENDING --> FAILED: payment.failed / Bank Decline
    CAPTURED --> CREDITED: ACID Wallet Crediting (Funds & Ledger Updated)
    CREDITED --> [*]: Terminal Immutable State
    FAILED --> [*]: Terminal Failure State
```

> [!NOTE]
> **Terminal Immutability Guarantee**: Once a payment enters `CREDITED`, its status is mathematically locked. Delayed or out-of-order webhooks (such as late `payment.authorized` or `payment.failed`) can never downgrade, alter, or revert the payment state.

---

### Razorpay API Endpoints Reference

All payment endpoints are mounted under `/api/payments` and enforce strict JWT authentication (`requireAuth`) derived from HTTP-only cookies or `Authorization: Bearer <token>` headers. Client-supplied user IDs in request bodies are ignored.

| Method | Endpoint | Auth | Purpose | Payload / Query |
| :--- | :--- | :---: | :--- | :--- |
| `POST` | `/api/payments/create-order` | Yes | Generate Razorpay Test Order | `{ "amount": 5000, "idempotencyKey": "opt_key" }` |
| `POST` | `/api/payments/verify` | Yes | Verify Checkout signature & credit wallet | `{ "razorpay_order_id": "...", "razorpay_payment_id": "...", "razorpay_signature": "..." }` |
| `POST` | `/api/webhooks/razorpay` | No (HMAC) | Receive gateway lifecycle webhooks | Raw JSON body + `x-razorpay-signature` header |
| `GET` | `/api/payments/status/:orderId` | Yes | Query authoritative status & trigger recovery | URL param: `orderId` or `internalPaymentId` |
| `GET` | `/api/payments/transactions` | Yes | Paginated immutable wallet transaction ledger | Query params: `page=1`, `limit=10`, `type=DEPOSIT` |
| `POST` | `/api/payments/refund` | Yes | Controlled partial/full refund | `{ "payment_id": "...", "amount": 200000, "reason": "..." }` |
| `GET` | `/api/payments/refunds/:id` | Yes | Fetch auditable refund history for a payment | URL param: payment or order identifier |
| `GET` | `/api/payments/config` | Yes | Public Razorpay key and currency configuration | Returns `{ "keyId": "rzp_test_...", "currency": "INR" }` |
| `GET` | `/health` / `/api/health` | No | Deployment health & service status probe | Returns service readiness (MongoDB, Razorpay, WS) |

---

### Razorpay Webhook Architecture & Enterprise Observability

The webhook receiver at `POST /api/webhooks/razorpay` delivers enterprise-grade observability and cryptographic security:

1. **Pristine Raw Request Body Buffer**:
   - Preserves the unmodified raw request body (`Buffer`) via `express.raw({ type: "*/*" })` mounted strictly **before** standard `bodyParser.json()`.
   - **Why Raw Body is Essential**: Standard JSON parsers re-serialize payloads, reordering object keys and stripping whitespace, which corrupts HMAC-SHA256 calculations. Raw body preservation guarantees byte-identical signature verification against Razorpay's `x-razorpay-signature` header using `crypto.timingSafeEqual`.

2. **Dual-Layer Observability System**:
   - **Render Application Logs (Real-Time)**: Emits structured JSON log lines prefixed with `[RazorpayWebhook]` to provide immediate operational visibility in the Render dashboard:
     ```json
     [RazorpayWebhook] {"timestamp":"2026-11-15T10:45:27.114Z","level":"info","stage":"incoming_request","eventId":"evt_12345","message":"Incoming Razorpay webhook HTTP request received."}
     ```
   - **MongoDB Persistent Audit (`WebhookEventModel` in `webhook_events`)**: Every event is captured with raw payload, computed signature validity, processing state (`RECEIVED`, `PROCESSING`, `PROCESSED`, `FAILED`), timestamps, retry counts, and failure diagnostics.
   - **Monitored Lifecycle Stages**: `incoming_request`, `signature_verification`, `payload_parsed`, `event_persistence`, `payment_processing`, `payment_status_update`, `wallet_crediting`, `refund_received`, `refund_correlation`, `refund_status_update`, `refund_duplicate`, `duplicate_detection`, `event_completed`, and `event_error`.

3. **Replay & Duplicate Protection**:
   - Backed by a MongoDB unique compound index on `WebhookEventModel.razorpayEventId`.
   - Duplicate event deliveries are acknowledged with `HTTP 200 { "duplicate": true }` within <100ms, preventing redundant processing loops while adhering to Razorpay delivery contracts.

4. **Handled Webhook Event Types**:
   - `payment.authorized`: Updates `CREATED` payments to `PENDING` (strictly never downgrades `CAPTURED` or `CREDITED` payments).
   - `payment.captured`: Confirms capture and calls `processCapturedPayment()` for ACID wallet crediting.
   - `payment.failed`: Records error description and transitions status to `FAILED`.
   - `order.paid`: Confirms order capture and triggers wallet crediting.
   - `refund.processed`: Correlates refund with internal payment record, updates `amountRefunded`, and transitions status to `FULL` or `PARTIAL`.
   - `refund.failed`: Backs out uncompleted refund amount and logs failure reason.

---

### Razorpay Wallet Integrity & ACID Ledger Consistency

All wallet balance updates are governed by `backend/services/paymentProcessingService.js`:
- **Serialized User Locking**: Uses an async per-user mutex (`acquireUserLock(userId)`) to serialize order processing and balance mutations, eliminating race conditions across rapid concurrent requests.
- **ACID MongoDB Transactions**: Executed within a Mongoose multi-document transaction (`session.startTransaction()`) with an automated exponential backoff retry loop (up to 5 attempts) to absorb `TransientTransactionError` and write conflicts.
- **Atomic Balance Increments**: Simultaneously increments `availableCash`, `availableMargin`, and `payin` on `FundsModel` in a single atomic database operation.
- **Conditional State Machine**: Uses atomic query filter `{ _id: payment._id, status: "CAPTURED" }` during credit transition, ensuring that simultaneous checkout verification and webhook delivery can never double-credit the user's wallet.
- **Immutable Ledger Entry**: Writes a permanent dual-entry record into `WalletTransactionModel` recording `balanceBefore`, `balanceAfter`, integer `amountPaise`, rupee `amountRupees`, status `COMPLETED`, and Razorpay order/payment linkage.
- **Real-Time Notification**: Emits `funds_update` via Socket.IO strictly *post-commit*, guaranteeing zero phantom notifications on transaction rollbacks.

---

### Razorpay Automated Background Reconciliation Service

Located in `backend/services/paymentReconciliationService.js`:
- Automatically runs in the background on a configurable interval (default: 5 minutes) started during server boot and gracefully terminated on `SIGINT`/`SIGTERM`.
- Identifies candidate payments in `CREATED`, `PENDING`, or uncredited `CAPTURED` states older than 10 minutes.
- Employs **Atomic Document Leases** (`findOneAndUpdate` with `reconciliationLockedUntil: { $lte: now }`) to prevent horizontal multi-instance workers from racing on the same payment.
- Queries `razorpay.orders.fetchPayments(orderId)` authoritatively.
- Validates amount, currency (`INR`), and ownership. Discrepancies are flagged (`FLAGGED_AMOUNT_MISMATCH`, `FLAGGED_CURRENCY_MISMATCH`) without crediting the wallet.
- If authoritative status is `captured`, safely delegates to `processCapturedPayment()`.
- Single-process mutex (`isReconciliationRunning`) prevents overlapping interval executions.

---

### Razorpay Safe Refund Handling & Concurrency Invariants

Located in `backend/services/paymentRefundService.js`:
- **Strict Authorization**: Only the owner of a payment can initiate a refund; cross-user attempts return `HTTP 403 Forbidden`.
- **Status Verification**: Only `CAPTURED` or `CREDITED` payments can be refunded; uncaptured orders are rejected with `HTTP 400`.
- **Partial & Full Refunds**: Supports refunds up to the remaining unrefunded balance; attempts exceeding this balance are rejected.
- **Margin Deficit Prevention**: If `deductFromWallet: true` is requested on a `CREDITED` payment, the system verifies `availableMargin >= refundAmountRupees`. If available margin is insufficient (e.g. funds are tied up in stock positions), the gateway refund proceeds, but the wallet deduction is safely skipped (`walletDeductionStatus: "INSUFFICIENT_FUNDS"`) to prevent negative margin.
- **Atomic Payin Floor Protection**: Inside the transaction, payin deductions are calculated using the live database value and clamped so that `payin` is strictly bounded at ₹0. Concurrent refunds can never drive `payin` negative.
- **Supported SDK Method**: Uses the official Razorpay SDK v2.9.8 method `client.payments.fetchMultipleRefund(paymentId, params)` with pagination and notes correlation (`notes.internalRefundId`) rather than unsupported endpoints.
- **Gateway Outcome Differentiation (Timeout vs Rejection)**:
  - **Definite Gateway Rejection (HTTP 400)**: Immediately rolls back the wallet debit and updates the refund status to `FAILED`.
  - **Gateway Network Timeout / Error (HTTP 504, ECONNRESET)**: Treats the outcome as uncertain (`isGatewayUncertain: true`), retains the wallet deduction safely, leaves the refund in `PENDING`, and queues it for the automated background reconciliation worker.
  - **Max Attempts Guard**: If reconciliation cannot confirm a refund after 10 attempts, the record transitions to `FLAGGED` for administrative review without issuing a duplicate refund.
- **Ledger Immutability**: Historical deposit records are never modified; a distinct `type: "REFUND"` ledger transaction is created with negative delta tracking.

---

### Razorpay Environment Variables Configuration

The platform requires specific environment variables for backend API operations and frontend checkout initialization. Documented below from the authoritative `.env.example` templates:

#### Backend Environment Variables (`backend/.env`)

| Variable Name | Required | Example / Default | Description & Security Guidelines |
| :--- | :---: | :--- | :--- |
| `PORT` | Optional | `3001` (local) / `10000` (Render) | Port for Express HTTP server and Socket.IO. |
| `NODE_ENV` | **Yes** | `production` or `development` | Node environment flag enabling production optimizations and strict error masks. |
| `MONGO_URL` | **Yes** | `mongodb+srv://<USER>:<PASS>@<CLUSTER>/zerodha?retryWrites=true&w=majority` | MongoDB Atlas connection string. Requires a replica set cluster to support multi-document ACID transactions. |
| `TOKEN_KEY` | **Yes** | `your_secure_jwt_secret_key_here` | 32+ character high-entropy secret string used to sign and verify user JWTs in HTTP cookies and WebSocket handshakes. |
| `ALLOWED_ORIGINS` | **Yes** | `https://stock-trading-platform-wx2c.onrender.com` | Comma-separated list of permitted CORS origins. Must include your production URL. |
| `RAZORPAY_KEY_ID` | **Yes** | `rzp_test_placeholder_key_id` | **Razorpay Test Key ID**. Public identifier obtained from Razorpay Dashboard &rarr; Settings &rarr; API Keys. Must start with `rzp_test_`. |
| `RAZORPAY_KEY_SECRET` | **Yes** | `placeholder_test_key_secret` | **Razorpay Test Key Secret**. Private secret used strictly on the backend to compute checkout HMAC-SHA256 signatures and authenticate SDK calls. **Never commit to Git.** |
| `RAZORPAY_WEBHOOK_SECRET` | **Yes** | `placeholder_webhook_secret` | **Razorpay Webhook Secret**. Secret key chosen when creating the webhook in Razorpay Dashboard. Used to cryptographically verify incoming webhook event signatures. |
| `TWELVE_DATA_API_KEY` | Optional | `your_twelve_data_api_key_here` | External market data API key. If omitted, internal cached/mock market ticker is used automatically. |
| `GEMINI_API_KEY` | Optional | `your_gemini_api_key_here` | Google Gemini API key for AI portfolio diagnostics. If omitted, an internal deterministic rule engine is used. |

> [!WARNING]
> **Key vs. Secret Distinction**:
> - `RAZORPAY_KEY_ID`: Safe for frontend exposure and SDK modal initialization.
> - `RAZORPAY_KEY_SECRET`: Private server-side credential. **Never expose in frontend code, client responses, or version control.**
> - `RAZORPAY_WEBHOOK_SECRET`: Shared secret between Razorpay and your backend server to authenticate webhook payloads.

#### Frontend & Dashboard Environment Variables (`dashboard/.env`)

| Variable Name | Required | Example / Default | Description |
| :--- | :---: | :--- | :--- |
| `REACT_APP_API_URL` | **Yes** | `http://localhost:3001` | Backend REST API root URL. In production, set to your Render backend URL. |
| `REACT_APP_SOCKET_URL` | **Yes** | `http://localhost:3001` | Backend Socket.IO server URL for real-time market and funds distribution. |
| `REACT_APP_RAZORPAY_KEY_ID` | **Yes** | `rzp_test_placeholder_key_id` | Public Test Key ID passed to the Razorpay Checkout modal in browser runtime. |

---

### Razorpay Local Setup & Render Cloud Deployment

#### 1. Local Development Setup

1. **Install Dependencies**:
   ```bash
   npm run install-all
   ```
2. **Configure Backend Environment**:
   Copy `backend/.env.example` to `backend/.env` and supply your MongoDB Atlas URI, JWT token key, and Razorpay Test credentials:
   ```env
   PORT=3001
   NODE_ENV=development
   MONGO_URL=mongodb+srv://<USER>:<PASS>@<CLUSTER>/zerodha?retryWrites=true&w=majority
   TOKEN_KEY=your_secure_jwt_secret_key_32chars_long
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
   RAZORPAY_KEY_ID=rzp_test_your_test_key_id
   RAZORPAY_KEY_SECRET=your_test_key_secret
   RAZORPAY_WEBHOOK_SECRET=your_test_webhook_secret
   ```
3. **Configure Dashboard Environment**:
   Copy `dashboard/.env.example` to `dashboard/.env`:
   ```env
   REACT_APP_API_URL=http://localhost:3001
   REACT_APP_SOCKET_URL=http://localhost:3001
   REACT_APP_RAZORPAY_KEY_ID=rzp_test_your_test_key_id
   ```
4. **Start Application Servers**:
   ```bash
   # Terminal 1: Backend Server (Port 3001)
   npm run server

   # Terminal 2: Trading Dashboard (Port 3000)
   npm run build:dashboard && npx serve -s dashboard/build -l 3000
   ```

#### 2. Configuring Razorpay Dashboard (Test Mode)

1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com/) and ensure **Test Mode** toggle is active.
2. Navigate to **Settings** &rarr; **API Keys** &rarr; click **Generate Test Key**. Save the Key ID and Key Secret.
3. Navigate to **Settings** &rarr; **Webhooks** &rarr; click **Add New Webhook**:
   - **Webhook URL**:
     - *Production*: `https://stock-trading-platform-wx2c.onrender.com/api/webhooks/razorpay`
     - *Local*: `https://<your-ngrok-domain>.ngrok-free.app/api/webhooks/razorpay`
   - **Secret**: Enter your chosen `RAZORPAY_WEBHOOK_SECRET`.
   - **Active Events**: Select `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`.

#### 3. Render Cloud Deployment

- **Live Deployed Application URL**: [https://stock-trading-platform-wx2c.onrender.com/](https://stock-trading-platform-wx2c.onrender.com/)
- **Authoritative Webhook Endpoint**: [https://stock-trading-platform-wx2c.onrender.com/api/webhooks/razorpay](https://stock-trading-platform-wx2c.onrender.com/api/webhooks/razorpay)

Configure your Render Web Service as follows:
- **Environment**: `Node`
- **Build Command**: `npm run install-all && npm run build`
- **Start Command**: `npm start`
- **Health Check Path**: `/health` (returns `HTTP 200` with service diagnostic JSON).
- **Environment Variables**:
  - `NODE_ENV`: `production`
  - `MONGO_URL`: `mongodb+srv://...` (Atlas replica set URI)
  - `TOKEN_KEY`: 32+ character random string
  - `ALLOWED_ORIGINS`: `https://stock-trading-platform-wx2c.onrender.com`
  - `RAZORPAY_KEY_ID`: `rzp_test_...`
  - `RAZORPAY_KEY_SECRET`: `...`
  - `RAZORPAY_WEBHOOK_SECRET`: `...`

#### 4. Operational Monitoring & Verification
- **Viewing Real-Time Logs in Render**:
  Open the Render dashboard for your web service &rarr; navigate to **Logs**. Look for structured JSON log lines tagged `[RazorpayWebhook]`:
  ```
  [RazorpayWebhook] {"timestamp":"...","level":"info","stage":"signature_verification","eventId":"evt_...","message":"Webhook signature verification successful."}
  [RazorpayWebhook] {"timestamp":"...","level":"info","stage":"wallet_crediting","eventId":"evt_...","status":"CREDITED","message":"Wallet crediting successfully committed..."}
  ```
- **Inspecting Webhook Records in MongoDB Atlas**:
  Open MongoDB Atlas &rarr; select cluster &rarr; navigate to **Collections** &rarr; open `webhook_events`. Verify stored documents containing `razorpayEventId`, `signatureVerified: true`, `processingStatus: "PROCESSED"`, and timestamps.

---

## Screenshots & UI Showcase

The platform includes a collection of visual brand assets and UI illustrations stored within the repository:

| Feature Area | Asset Location | Visual Highlights |
| :--- | :--- | :--- |
| **Marketing Hero** | [`frontend/public/media/images/homeHero.svg`](file:///d:/Desktop/zerodha/frontend/public/media/images/homeHero.svg) | Clean vector graphic illustrating the Kite trading terminal experience |
| **Pricing Breakdown** | [`frontend/public/media/images/pricingEquity.svg`](file:///d:/Desktop/zerodha/frontend/public/media/images/pricingEquity.svg) | Visual breakdown of ₹0 free equity delivery and ₹20 intraday rates |
| **Zerodha Ecosystem** | [`frontend/public/media/images/ecosystem.png`](file:///d:/Desktop/zerodha/frontend/public/media/images/ecosystem.png) | Platform connectivity map across Kite, Console, Coin, and partner apps |
| **Partner App Logos** | [`dashboard/public/media/images/`](file:///d:/Desktop/zerodha/dashboard/public/media/images/) | Official SVGs and PNGs for Smallcase, Sensibull, Streak, Tijori, Quicko, and Fund House |

> [!TIP]
> **Adding Live Screenshots**: If you capture full-screen screenshots of your local running instance, place them in a newly created directory `docs/screenshots/` with the following suggested filenames:
> - `docs/screenshots/01-marketing-home.png` — Marketing Landing Page (`localhost:5173`)
> - `docs/screenshots/02-trading-dashboard.png` — Trading Terminal & Watchlist (`localhost:3000`)
> - `docs/screenshots/03-stock-analytics-modal.png` — Technical Charts & Level 2 Depth
> - `docs/screenshots/04-ai-portfolio-analyst.png` — Gemini AI Portfolio Analysis Modal
> - `docs/screenshots/05-funds-upi-deposit.png` — Virtual UPI Instant Deposit Modal

---

## Testing & Quality Assurance

### Razorpay Payment Integration Test Suites (608 / 608 Tests Passing)

The repository contains 11 dedicated payment test suites in `backend/tests/` running against live MongoDB Atlas test collections with zero real-money exposure:

| Test Suite | Command | Tests | Focus Area |
| :--- | :--- | :---: | :--- |
| **Order Creation** | `node backend/tests/test_payment_order_creation.test.js` | 40 | Limits (₹100–₹1,00,000), integer paise math, idempotency |
| **Verification** | `node backend/tests/test_payment_verification.test.js` | 46 | HMAC-SHA256 timingSafeEqual, user ownership, gateway fetch |
| **Webhooks** | `node backend/tests/test_razorpay_webhooks.test.js` | 48 | Raw body signature, event deduplication, retry recovery worker |
| **Webhook Observability** | `node backend/tests/test_webhook_observability.test.js` | 40 | Render JSON logging, MongoDB event audit trail, error tracing |
| **Wallet Crediting** | `node backend/tests/test_payment_wallet_crediting.test.js` | 45 | ACID MongoDB transactions, immutable ledger, Socket.IO updates |
| **Frontend Checkout** | `node backend/tests/test_frontend_razorpay_checkout.test.js` | 37 | Modal flow, double-click lock, script failure recovery |
| **Transaction History**| `node backend/tests/test_wallet_transaction_history.test.js` | 64 | Ledger pagination, sorting, ownership isolation, filtering |
| **Failure & Recovery** | `node backend/tests/test_payment_failure_and_recovery.test.js` | 34 | Out-of-order webhooks, status polling, terminal immutability |
| **Reconciliation** | `node backend/tests/test_payment_reconciliation.test.js` | 43 | Stale payment polling, atomic lease locks, scheduler lifecycle |
| **Refunds** | `node backend/tests/test_payment_refunds.test.js` | 151 | Partial/full refunds, deficit avoidance, SDK v2.9.8, payin floor |
| **Master Lifecycle** | `node backend/tests/test_payment_lifecycle_master.test.js` | 60 | Complete end-to-end lifecycle, stock trades, UPI compatibility |

Combined with the 38 core trading tests, the project achieves **646 / 646 passing automated tests** with 100% pass rate.

> [!NOTE]
> **Automated Test Validation & Live Webhook Notice**: All 11 automated payment and webhook test suites execute against live MongoDB Atlas database collections using authentic HMAC-SHA256 signature calculations, official Razorpay SDK methods, and ephemeral HTTP/WebSocket servers. These tests verify end-to-end algorithmic correctness, ACID ledger atomicity, double-credit prevention, and duplicate webhook protection. They do not simulate or claim receipt of unverified external production webhooks; live webhook reception occurs when Razorpay dispatches events to your deployed Render URL.

To run the complete master end-to-end lifecycle QA pass:
```bash
node backend/tests/test_payment_lifecycle_master.test.js
```

### Core Trading Test Suites

The repository contains four automated test suites in the `backend/tests/` directory:

1. **Limit Orders & Order Matching Test Suite (`backend/tests/limit_orders_and_matching.test.js`)**:
   - 14 automated verification scenarios testing server-authoritative execution prices, Ask/Bid standard limit matching, price improvement refunds, share reservation (`lockedQty`), order cancellation, and concurrency race serialization.
   - **How to Run**:
     ```bash
     cd backend
     node tests/limit_orders_and_matching.test.js
     ```

2. **Backend Reliability, Security & MIS Audit Suite (`backend/tests/backend_reliability_audit.test.js`)**:
   - 24 automated scenarios testing strict JWT route protection (401 on missing/tampered token), Socket.IO handshake authentication & room isolation, full 10-state MIS intraday accounting (open, increase, reduce, close, reversals with realized P&L), share oversell prevention, atomic concurrent funds withdrawals, and user-scoped idempotency.
   - **How to Run**:
     ```bash
     cd backend
     node tests/backend_reliability_audit.test.js
     ```

3. **Enhancements Test Suite (`backend/tests/enhancements.test.js`)**:
   - Tests order validation, insufficient funds rejection, CNC sell limits, limit order placement, limit order cancellation, per-user mutex concurrency serialization, Socket.IO updates, and Gemini AI portfolio analysis.
   - **How to Run**:
     ```bash
     # Ensure the backend server is running on port 3002, then in a new terminal:
     cd backend
     node tests/enhancements.test.js
     ```

4. **Comprehensive End-to-End QA Audit (`backend/tests/qa_e2e_full_audit.test.js`)**:
   - Simulates multi-user onboarding (User Alpha & User Beta), session isolation, cross-user authorization barriers, rapid concurrent order placement, and end-to-end P&L math.
   - **How to Run**:
     ```bash
     cd backend
     node tests/qa_e2e_full_audit.test.js
     ```

### Production Build Verification

Both front-end applications build cleanly for production deployment:

```bash
# 1. Verify Marketing Portal Production Build (Vite)
cd frontend
npm run build
# Expected Output: transforms modules and outputs dist/ with code 0

# 2. Verify Trading Dashboard Production Build (React Scripts)
cd ../dashboard
npm run build
# Expected Output: compiled successfully and outputs build/ with code 0
```

---

## Security Safeguards & Limitations

### Implemented Safeguards
- **Password Security**: Passwords are never stored in plaintext; hashed with bcrypt using 12 salt rounds.
- **Stateless Session Tokens**: JSON Web Tokens signed with a configurable server secret (`TOKEN_KEY`).
- **Race Condition Prevention**: Per-user async mutex serialization ensures that simultaneous orders cannot bypass balance checks.
- **Idempotency Protection**: Rapid duplicate submissions with the same key are caught in memory and in the database.
- **Server-Authoritative Margin**: The client cannot dictate margin deductions or prices; the backend computes required cash and validates against the database.
- **AI Graceful Fallback**: If external AI APIs fail or rate limits are exceeded, an internal deterministic rule engine ensures zero application crashes.

### Current Limitations
- **Paper Trading Only**: This application is not integrated with the National Stock Exchange of India (NSE), Bombay Stock Exchange (BSE), or SEBI-registered depositories (CDSL/NSDL).
- **Simulated Order Matching**: Market orders fill instantaneously at quoted prices; limit orders match based on synthetic quote triggers rather than an exchange matching engine.
- **Third-Party API Quotas**: The free tier of Twelve Data API allows 8 credits/minute and 800 credits/day. The application gracefully degrades to cached data and Yahoo Finance when quotas are exceeded.
- **AI Financial Disclaimer**: AI-generated portfolio diagnostics are intended strictly for educational practice and algorithmic simulation. They do not constitute certified financial or investment advice.

---

## Project Roadmap

### Implemented Features
- [x] Full Zerodha Kite-style trading dashboard UI with dual watchlists (NIFTY 50 & NASDAQ 100).
- [x] Level 2 market depth order book and multi-timeframe technical charts (SMA, EMA, Volume).
- [x] Complete order execution engine with MARKET / LIMIT and CNC / MIS product types.
- [x] Server-authoritative virtual funds management with UPI deposit and withdrawal simulation.
- [x] Razorpay Payment Gateway integration (Test Mode) with synchronized checkout modal & verified wallet crediting.
- [x] Enterprise webhook observability system with dual Render JSON logs & persistent MongoDB audit collection.
- [x] Multi-document ACID transaction processing with automated retry on transient write conflicts.
- [x] Automated background reconciliation scheduler for stale payments and pending refunds with atomic document leases.
- [x] Controlled partial & full refund management with margin deficit avoidance & non-negative payin clamping.
- [x] Real-time bi-directional WebSocket state distribution via Socket.IO.
- [x] Gemini 2.5 Flash AI Portfolio Analyst with deterministic rule fallback.
- [x] Multi-page responsive marketing website with user registration and login.
- [x] Full brand partner showcase (Smallcase, Sensibull, Quicko, Tijori, Streak, etc.) with official logos.

---


### License
This project is open-source and distributed under the **ISC License**. See the `package.json` manifests for details.

---

*Developed with passion as a comprehensive study of high-performance fintech architecture, real-time trading systems, and modern full-stack web development.*
