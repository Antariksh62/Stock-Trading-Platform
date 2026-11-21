# Zerodha Clone

A full-stack stock trading platform inspired by Zerodha, featuring an interactive trading terminal, a marketing website, and a server-authoritative backend engine. Built with the MERN stack and Socket.IO, the application demonstrates end-to-end financial transaction workflows including order matching, wallet management, real-time portfolio updates, and Razorpay payment integration.

**Live Demo:** [https://stock-trading-platform-wx2c.onrender.com/](https://stock-trading-platform-wx2c.onrender.com/)

---

## Features

### Trading & Portfolio Management
- **Watchlist**: Searchable dual-market watchlist tracking NIFTY 50 and NASDAQ 100 equities with real-time price change indicators.
- **Order Execution**: Buy and sell order workflows supporting CNC (Equity Delivery) and MIS (Intraday Margin) product types.
- **Order Types**: Instant MARKET order execution and price-triggered LIMIT orders with pending order management.
- **Holdings & Positions**: Real-time portfolio tracking calculating total investment, current valuation, and Mark-to-Market (MTM) P&L.
- **Order Book**: Interactive order history tracking execution statuses (`FILLED`, `PENDING`, `CANCELLED`, `REJECTED`) with one-click limit order cancellation.
- **Risk & Margin Checks**: Pre-trade balance validation preventing overdrafts, short-selling on delivery holdings, and duplicate submissions.

### Payments & Wallet
- **Razorpay Checkout Integration**: In-app modal checkout supporting test card, UPI, and netbanking deposit methods.
- **Test Mode Operation**: Safe paper-trading deposit flows running strictly against Razorpay Test Mode.
- **Webhook Processing**: Cryptographically verified webhook listener handling asynchronous gateway notifications (`payment.captured`, `payment.failed`, `refund.processed`).
- **Atomic Wallet Crediting**: Multi-document MongoDB ACID transactions ensuring ledger updates and wallet balances remain synchronized.
- **Transaction Ledger**: Immutable audit log recording transaction type, amount in paise and rupees, opening balance, and closing balance.
- **Idempotency Safeguards**: Prevents duplicate wallet credits across concurrent checkout verification calls and webhook deliveries.

### Real-Time Functionality
- **Socket.IO Pipeline**: Full-duplex WebSocket connection delivering instant UI state synchronization without page polling.
- **Private Room Scoping**: Authenticated WebSocket connections join isolated rooms (`room:user:<userId>`), preventing cross-user event leakage.
- **Reactive Dashboard Updates**: Real-time event distribution for `orders_update`, `holdings_update`, `positions_update`, and `funds_update`.
- **Market Data Feeds**: Dynamic indices ticker streaming real-time values for NIFTY 50, SENSEX, and NASDAQ.

### Authentication & Security
- **JWT Authentication**: Stateless token-based authentication delivered via HTTP-only cookies and Authorization headers.
- **Protected Routes**: Centralized middleware verifying token signatures on all financial, trading, and account endpoints.
- **Data Isolation**: User identity is derived strictly from verified token payloads; user-supplied IDs in request bodies are ignored.
- **Password Hashing**: User credentials hashed using bcrypt with 12 salt rounds before database persistence.

### Dashboard & Analytics
- **Technical Charting**: Interactive charts with multi-timeframe views (`1D`, `1W`, `1M`, `1Y`, `ALL`), Candlestick and Line modes, SMA (14), EMA (20), and volume bars.
- **Market Depth**: 5-level Bids vs. Asks order book displaying buyer/seller distribution ratios.
- **Funds Management**: Detailed equity margin overview covering available margin, used margin, opening balance, and withdrawal requests.
- **AI Portfolio Analyst**: Quantitative diagnostics evaluating sector concentration, risk exposure, and top gainers/losers powered by Google Gemini (with deterministic offline fallback).
- **Responsive Interface**: Mobile-friendly layout with collapsible navigation and desktop-grade desktop ergonomics.

---

## Tech Stack

| Domain | Technologies |
| :--- | :--- |
| **Frontend** | React 18 (`dashboard`), React 19 (`frontend`), Vite 7, React Router DOM, Chart.js, Material UI Icons, Bootstrap 5 |
| **Backend** | Node.js, Express 5, Socket.IO |
| **Database** | MongoDB Atlas, Mongoose 9 (Multi-document ACID transactions) |
| **Authentication** | JSON Web Tokens (JWT), bcryptjs |
| **Payments** | Razorpay Node.js SDK (Test Mode), Webhooks (HMAC-SHA256) |
| **Real-Time Communication** | Socket.IO (WebSocket transport with HTTP long-polling fallback) |
| **Testing & Deployment** | Node.js Test Runner, Render Cloud Platform |

---

## Engineering Highlights

- **Dual-Path Payment Convergence**: Resolves race conditions between synchronous client verification (`POST /api/payments/verify`) and asynchronous webhooks (`POST /api/webhooks/razorpay`) using an idempotent service layer that guarantees exactly-once wallet crediting.
- **Timing-Safe HMAC Verification**: Validates Razorpay checkout signatures and webhook event headers using `crypto.timingSafeEqual` over raw request body buffers to eliminate timing attack vectors.
- **Transaction Consistency & ACID Ledger**: Executes wallet balance modifications and immutable ledger creation within MongoDB replica set transactions (`session.withTransaction`) with automated retry loops for transient write conflicts.
- **Per-User Concurrency Mutex**: Employs an in-memory asynchronous mutex (`acquireUserLock` / `releaseUserLock`) per user ID to serialize order placement, preventing double-spending and margin overdrafts under rapid concurrent requests.
- **Share Reservation & Short-Sell Protection**: CNC sell orders verify active ownership and lock allocated quantities (`lockedQty`) in the database, preventing concurrent sell attempts from overselling the same shares.
- **Socket.IO Handshake Authentication**: Enforces JWT verification during the initial WebSocket handshake, binding socket instances strictly to verified user accounts and eliminating room-spoofing risks.
- **Automated Background Reconciliation**: Stale or pending payment orders older than 10 minutes are polled by an automated reconciliation worker using distributed document leases to recover uncredited gateway deposits safely.
- **Modular Layered Architecture**: Decoupled codebase structured into controllers (HTTP transport), services (domain business logic), models/schemas (data contracts), and middleware (security guards).

---

## Architecture & Project Structure

The project is structured as a multi-tier application:

```
zerodha/
├── backend/
│   ├── index.js                      # Primary server entry point & Socket.IO server
│   ├── config/
│   │   └── razorpay.js               # Razorpay client initialization (Test Mode guard)
│   ├── controllers/
│   │   ├── AuthController.js         # Signup, login, and session validation
│   │   ├── PaymentController.js      # Order creation, verification, and ledger queries
│   │   ├── WebhookController.js      # Razorpay webhook lifecycle ingestion
│   │   └── aiPortfolioController.js  # Gemini AI portfolio diagnostics
│   ├── middlewares/
│   │   └── AuthMiddleware.js         # JWT token extraction and verification
│   ├── model/                        # Mongoose model definitions
│   │   ├── FundsModel.js             # User wallet balances and margins
│   │   ├── HoldingsModel.js          # CNC delivery holdings
│   │   ├── OrdersModel.js            # Trading order records
│   │   ├── PaymentOrderModel.js      # Payment intent and gateway states
│   │   ├── PositionsModel.js         # MIS intraday positions
│   │   ├── UserModel.js              # User credentials and metadata
│   │   ├── WalletTransactionModel.js # Immutable accounting ledger
│   │   └── WebhookEventModel.js      # Webhook delivery audit logs
│   ├── schemas/                      # Database schema definitions
│   ├── services/                     # Business logic
│   │   ├── orderExecutionService.js  # Mutex locking, margin math, order execution
│   │   ├── paymentProcessingService.js# ACID wallet crediting and state transitions
│   │   ├── paymentReconciliationService.js # Stale payment recovery worker
│   │   ├── paymentRefundService.js   # Controlled partial/full refunds
│   │   ├── paymentService.js         # Razorpay SDK calls & signature verification
│   │   ├── portfolioAnalystService.js# Math calculations and AI integration
│   │   ├── tickerService.js          # Market index polling and cache
│   │   └── webhookService.js         # Webhook deduplication and event dispatch
│   └── tests/                        # Automated test suites
├── dashboard/                        # Trading Terminal (React 18)
│   ├── src/
│   │   ├── components/               # Watchlist, Orders, Holdings, Funds, BuyActionWindow
│   │   ├── services/                 # Socket.IO client and API utilities
│   │   └── index.js                  # React DOM root
│   └── public/                       # Static assets and HTML template
└── frontend/                         # Marketing Website (React 19 + Vite 7)
    └── src/
        ├── landing_page/             # Home, Products, Pricing, About, Support, Signup
        └── main.jsx                  # Vite React root
```

---

## Getting Started

### Prerequisites
- **Node.js**: `v18.0.0` or higher (recommended: `v20.x` LTS)
- **npm**: `v9.0.0` or higher
- **MongoDB**: A free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster connection URI or a local MongoDB replica set.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Antariksh62/Stock-Trading-Platform.git
   cd Stock-Trading-Platform
   ```

2. **Install all dependencies:**
   ```bash
   npm run install-all
   ```

### Environment Configuration

1. **Backend Configuration:**
   Copy the backend environment template and configure your credentials:
   ```bash
   cp backend/.env.example backend/.env
   ```

   Required variables in `backend/.env`:
   ```env
   PORT=3001
   NODE_ENV=development
   MONGO_URL=mongodb+srv://<USER>:<PASS>@<CLUSTER>/zerodha?retryWrites=true&w=majority
   TOKEN_KEY=your_secure_jwt_secret_key_at_least_32_characters
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
   RAZORPAY_KEY_ID=rzp_test_your_test_key_id
   RAZORPAY_KEY_SECRET=your_test_key_secret
   RAZORPAY_WEBHOOK_SECRET=your_test_webhook_secret
   ```

2. **Dashboard Configuration:**
   Copy the dashboard environment template:
   ```bash
   cp dashboard/.env.example dashboard/.env
   ```

   Required variables in `dashboard/.env`:
   ```env
   REACT_APP_API_URL=http://localhost:3001
   REACT_APP_SOCKET_URL=http://localhost:3001
   REACT_APP_RAZORPAY_KEY_ID=rzp_test_your_test_key_id
   ```

### Running the Application

#### Option 1: Unified Production Mode (Recommended)
Builds both client applications and serves them from the unified backend service:
```bash
npm run build
npm start
```
- Marketing Website: `http://localhost:3001/`
- Trading Dashboard: `http://localhost:3001/dashboard`
- REST API / WebSocket: `http://localhost:3001`

#### Option 2: Concurrent Development Mode
Open three separate terminals:

```bash
# Terminal 1: Backend API & WebSocket (Port 3001)
npm run server

# Terminal 2: Trading Terminal (Port 3000)
npm start --prefix dashboard

# Terminal 3: Marketing Website (Port 5173)
npm run dev --prefix frontend
```

---

## Razorpay Test Mode – Payment Testing

The platform runs payments in **Razorpay Test Mode** to simulate real-world wallet funding without real-money transactions.

### Test Card Details

| Field | Value |
|---|---|
| Card Network | Mastercard |
| Card Number | `5555 5100 0008 1006` |
| Card Type | Credit |
| Category | Business |
| CVV | Any random CVV, if supported |
| Expiry | Any future date, if supported |
| OTP | Follow Razorpay's documented test authentication flow |

> **Note:** For alternative test instruments, refer to the [Official Razorpay Test Card Documentation](https://razorpay.com/docs/payments/payments/test-card-details).

### Payment Testing Procedure
1. Run the dashboard and log in or enter guest paper-trading mode.
2. Navigate to **Funds** &rarr; **Add Funds**.
3. Enter the desired deposit amount (minimum ₹100).
4. Select **Pay with Razorpay**.
5. Select **Card** in the Razorpay Checkout modal.
6. Enter the test card details listed above.
7. Complete the simulated authentication flow as prompted by Razorpay.

> Payments are processed in Razorpay Test Mode. No real money is deducted when valid test credentials are used.

---

## Automated Testing

The backend includes test suites verifying order matching, concurrency mutex locking, JWT authorization barriers, and the complete payment lifecycle:

```bash
# Master end-to-end payment and lifecycle test
node backend/tests/test_payment_lifecycle_master.test.js

# Order matching, limits, and price-improvement refunds
node backend/tests/limit_orders_and_matching.test.js

# Security, JWT barriers, and MIS intraday accounting audit
node backend/tests/backend_reliability_audit.test.js

# Full multi-user end-to-end integration QA pass
node backend/tests/qa_e2e_full_audit.test.js
```

---

## License

This project is licensed under the [ISC License](package.json).
