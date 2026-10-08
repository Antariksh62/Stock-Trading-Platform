import React, { useContext } from "react";
import { MarketContext } from "../../context/MarketContext";

export const PaperPortfolioView = () => {
  const { portfolio, portfolioSummary, stocks, resetPaperAccount, setSelectedStock } =
    useContext(MarketContext);

  const {
    totalInvestedUSD,
    currentValUSD,
    pnlUSD,
    pnlUSDPercent,
    totalInvestedINR,
    currentValINR,
    pnlINR,
    pnlINRPercent,
  } = portfolioSummary;

  return (
    <div className="portfolio-view-container">
      {/* Overview Cards Grid */}
      <div className="portfolio-metrics-grid">
        {/* US Portfolio Card */}
        <div className="portfolio-card">
          <div className="card-header-row">
            <span className="card-title">US Equities Portfolio (USD)</span>
            <span className="market-tag tag-nasdaq">NASDAQ</span>
          </div>
          <div className="card-val-big">${(portfolio.cashUSD + currentValUSD).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="card-sub-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div>
              <span className="sub-label">Cash Balance</span>
              <span className="sub-val">${portfolio.cashUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="sub-label">Invested</span>
              <span className="sub-val">${totalInvestedUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="sub-label">Holdings Value</span>
              <span className="sub-val">${currentValUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="sub-label">Total P&L</span>
              <span className={`sub-val ${pnlUSD >= 0 ? "text-emerald" : "text-crimson"}`}>
                {pnlUSD >= 0 ? "+" : ""}${pnlUSD.toFixed(2)} ({pnlUSDPercent.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>

        {/* Indian Portfolio Card */}
        <div className="portfolio-card">
          <div className="card-header-row">
            <span className="card-title">Indian Equities Portfolio (INR)</span>
            <span className="market-tag tag-nse">NSE / NIFTY</span>
          </div>
          <div className="card-val-big">₹{(portfolio.cashINR + currentValINR).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="card-sub-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div>
              <span className="sub-label">Cash Balance</span>
              <span className="sub-val">₹{portfolio.cashINR.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="sub-label">Invested</span>
              <span className="sub-val">₹{totalInvestedINR.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="sub-label">Holdings Value</span>
              <span className="sub-val">₹{currentValINR.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="sub-label">Total P&L</span>
              <span className={`sub-val ${pnlINR >= 0 ? "text-emerald" : "text-crimson"}`}>
                {pnlINR >= 0 ? "+" : ""}₹{pnlINR.toFixed(2)} ({pnlINRPercent.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Holdings Section */}
      <div className="portfolio-section">
        <div className="section-header-row">
          <h2 className="section-title">Active Holdings ({portfolio.holdings.length})</h2>
          <button className="btn-outline-danger btn-sm" onClick={resetPaperAccount}>
            Reset Paper Account
          </button>
        </div>

        {portfolio.holdings.length === 0 ? (
          <div className="empty-state-box">
            <p>You have no open stock positions in your practice account.</p>
            <span className="text-muted">Place Buy orders from the watchlist or detail view to start practicing.</span>
          </div>
        ) : (
          <div className="table-responsive-wrapper">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Market</th>
                  <th>Quantity</th>
                  <th>Avg Price</th>
                  <th>LTP (Current)</th>
                  <th>Invested</th>
                  <th>Current Value</th>
                  <th>P&L</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.holdings.map((holding) => {
                  const liveStock = stocks.find((s) => s.symbol === holding.symbol);
                  const currentPrice = liveStock ? liveStock.price : holding.avgPrice;
                  const sym = holding.currency === "USD" ? "$" : "₹";
                  const invested = holding.qty * holding.avgPrice;
                  const current = holding.qty * currentPrice;
                  const pnl = current - invested;
                  const pnlPercent = (pnl / invested) * 100;
                  const isProfit = pnl >= 0;

                  return (
                    <tr
                      key={holding.symbol}
                      className="cursor-pointer"
                      onClick={() => liveStock && setSelectedStock(liveStock)}
                    >
                      <td>
                        <div className="fw-semibold text-white">{holding.symbol}</div>
                        <div className="text-muted small">{holding.name}</div>
                      </td>
                      <td>
                        <span className={`market-tag ${holding.market === "NASDAQ" ? "tag-nasdaq" : "tag-nse"}`}>
                          {holding.market}
                        </span>
                      </td>
                      <td>{holding.qty}</td>
                      <td>{sym}{holding.avgPrice.toFixed(2)}</td>
                      <td>{sym}{currentPrice.toFixed(2)}</td>
                      <td>{sym}{invested.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td>{sym}{current.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className={isProfit ? "text-emerald fw-semibold" : "text-crimson fw-semibold"}>
                        {isProfit ? "+" : ""}{sym}{pnl.toFixed(2)} ({isProfit ? "+" : ""}{pnlPercent.toFixed(2)}%)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Execution History */}
      <div className="portfolio-section">
        <h2 className="section-title">Order History ({portfolio.orders.length})</h2>
        {portfolio.orders.length === 0 ? (
          <div className="empty-state-box">
            <p>No orders executed yet in this session.</p>
          </div>
        ) : (
          <div className="table-responsive-wrapper">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>Type</th>
                  <th>Order Mode</th>
                  <th>Quantity</th>
                  <th>Executed Price</th>
                  <th>Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.orders.map((order) => {
                  const sym = order.currency === "USD" ? "$" : "₹";
                  return (
                    <tr key={order.id}>
                      <td className="text-muted">{order.timestamp}</td>
                      <td className="fw-semibold text-white">{order.symbol}</td>
                      <td>
                        <span className={`order-badge ${order.type === "BUY" ? "badge-buy" : "badge-sell"}`}>
                          {order.type}
                        </span>
                      </td>
                      <td className="text-muted">{order.orderType}</td>
                      <td>{order.qty}</td>
                      <td>{sym}{order.price.toFixed(2)}</td>
                      <td>{sym}{order.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
