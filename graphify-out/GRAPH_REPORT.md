# Graph Report - zerodha  (2026-10-10)

## Corpus Check
- 123 files · ~207,006 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 416 nodes · 573 edges · 23 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- AI Portfolio Analyst
- Trading & Ledger Engine
- Marketing & Public Ecosystem
- Stock Analytics & Visualizations
- Module Group 4
- Marketing & Public Ecosystem
- Module Group 6
- Authentication & User Management
- Trading & Ledger Engine
- Marketing & Public Ecosystem
- Trading & Ledger Engine
- Authentication & User Management
- Authentication & User Management
- Authentication & User Management
- AI Portfolio Analyst
- Marketing & Public Ecosystem
- Module Group 16
- Trading & Ledger Engine
- Module Group 18
- Module Group 19

## God Nodes (most connected - your core abstractions)
1. `TwelveDataService` - 12 edges
2. `GeneralContext` - 8 edges
3. `MarketContext` - 8 edges
4. `cancelOrder()` - 6 edges
5. `SocketService` - 6 edges
6. `getOrCreateUserFunds()` - 5 edges
7. `processOrder()` - 5 edges
8. `scripts` - 5 edges
9. `generateOrderBook()` - 5 edges
10. `scripts` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Signup()` --calls--> `createSecretToken()`  [EXTRACTED]
  backend/controllers/AuthController.js → backend/util/SecretToken.js
- `Login()` --calls--> `createSecretToken()`  [EXTRACTED]
  backend/controllers/AuthController.js → backend/util/SecretToken.js
- `broadcastUserUpdates()` --calls--> `getOrCreateUserFunds()`  [EXTRACTED]
  backend/index.js → backend/services/orderExecutionService.js
- `handleCancelOrderReq()` --calls--> `cancelOrder()`  [EXTRACTED]
  backend/index.js → backend/services/orderExecutionService.js
- `StockAnalyticsModal()` --calls--> `generateOrderBook()`  [EXTRACTED]
  dashboard/src/components/StockAnalyticsModal.js → dashboard/src/services/simulationEngine.js

## Import Cycles
- None detected.

## Communities (23 total, 0 thin omitted)

### Community 0 - "AI Portfolio Analyst"
Cohesion: 0.06
Nodes (25): AIPortfolioAnalystModal(), Apps(), appsList, BuyActionWindow(), Dashboard(), DoughnutChart(), Funds(), GeneralContext (+17 more)

### Community 1 - "Trading & Ledger Engine"
Cohesion: 0.08
Nodes (24): MarketDepthTable(), OrderExecutionPanel(), StockDetailView(), GraphifyChart(), GraphifyDepthChart(), GraphifyMiniSparkline(), ApiKeyModal(), TopBarNav() (+16 more)

### Community 2 - "Marketing & Public Ecosystem"
Cohesion: 0.09
Nodes (18): App(), Aboutpage(), Hero(), Team(), Footer(), Awards(), Education(), Hero() (+10 more)

### Community 3 - "Stock Analytics & Visualizations"
Cohesion: 0.06
Nodes (35): chart.js, dependencies, axios, chart.js, @emotion/react, @emotion/styled, lucide-react, @mui/icons-material (+27 more)

### Community 4 - "Module Group 4"
Cohesion: 0.06
Nodes (31): dependencies, axios, bcryptjs, body-parser, cookie-parser, cors, dotenv, express (+23 more)

### Community 5 - "Marketing & Public Ecosystem"
Cohesion: 0.07
Nodes (26): bootstrap, @fortawesome/fontawesome-svg-core, @fortawesome/free-solid-svg-icons, @fortawesome/react-fontawesome, dependencies, axios, bootstrap, @fortawesome/fontawesome-svg-core (+18 more)

### Community 6 - "Module Group 6"
Cohesion: 0.09
Nodes (21): browserslist, development, production, eslintConfig, extends, name, private, scripts (+13 more)

### Community 7 - "Authentication & User Management"
Cohesion: 0.10
Nodes (19): { analyzePortfolio }, app, bodyParser, cookieParser, cors, express, { FundsModel }, { HoldingsModel } (+11 more)

### Community 8 - "Trading & Ledger Engine"
Cohesion: 0.12
Nodes (15): FundsModel, { FundsSchema }, { model }, HoldingsModel, { HoldingsSchema }, { model }, FundsSchema, { Schema } (+7 more)

### Community 9 - "Marketing & Public Ecosystem"
Cohesion: 0.11
Nodes (19): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks (+11 more)

### Community 10 - "Trading & Ledger Engine"
Cohesion: 0.22
Nodes (13): broadcastUserUpdates(), handleCancelOrderReq(), acquireUserLock(), cancelOrder(), { FundsModel }, getOrCreateUserFunds(), { HoldingsModel }, idempotencyCache (+5 more)

### Community 11 - "Authentication & User Management"
Cohesion: 0.14
Nodes (13): author, description, devDependencies, nodemon, keywords, license, main, name (+5 more)

### Community 12 - "Authentication & User Management"
Cohesion: 0.20
Nodes (9): jwt, { UserModel }, userVerification(), { model }, UserModel, { UserSchema }, bcrypt, { Schema } (+1 more)

### Community 13 - "Authentication & User Management"
Cohesion: 0.27
Nodes (8): bcrypt, { createSecretToken }, Login(), Logout(), Signup(), { UserModel }, createSecretToken(), jwt

### Community 14 - "AI Portfolio Analyst"
Cohesion: 0.29
Nodes (5): AccountCharges(), Brokerage(), ChargesExplained(), Hero(), PricingPage()

### Community 15 - "Marketing & Public Ecosystem"
Cohesion: 0.29
Nodes (5): Hero(), LeftImage(), ProductPage(), RightImage(), Universe()

### Community 16 - "Module Group 16"
Cohesion: 0.29
Nodes (6): axios, ioClient, jwt, mongoose, runComprehensiveQA(), timestamp

### Community 17 - "Trading & Ledger Engine"
Cohesion: 0.33
Nodes (5): { model }, OrdersModel, { OrdersSchema }, OrdersSchema, { Schema }

### Community 18 - "Module Group 18"
Cohesion: 0.33
Nodes (5): { model }, PositionsModel, { PositionsSchema }, PositionsSchema, { Schema }

### Community 19 - "Module Group 19"
Cohesion: 0.40
Nodes (4): axios, ioClient, mongoose, runTests()

## Knowledge Gaps
- **146 isolated node(s):** `{ UserModel }`, `{ createSecretToken }`, `bcrypt`, `express`, `http` (+141 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Stock Analytics & Visualizations` to `Module Group 6`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Module Group 4` to `Authentication & User Management`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `{ UserModel }`, `{ createSecretToken }`, `bcrypt` to the rest of the system?**
  _146 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI Portfolio Analyst` be split into smaller, more focused modules?**
  _Cohesion score 0.0641025641025641 - nodes in this community are weakly interconnected._
- **Should `Trading & Ledger Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.0792156862745098 - nodes in this community are weakly interconnected._
- **Should `Marketing & Public Ecosystem` be split into smaller, more focused modules?**
  _Cohesion score 0.09009009009009009 - nodes in this community are weakly interconnected._
- **Should `Stock Analytics & Visualizations` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._