import React, { useState, useMemo } from "react";
import { GraphifyChart } from "./graphify/GraphifyChart";
import { generateOrderBook } from "../services/simulationEngine";

const companyProfiles = {
  RELIANCE: { fullName: "Reliance Industries Ltd.", sector: "Energy & Conglomerate", pe: 26.4, mcap: "19.5L Cr", high52: 3217.90, low52: 2220.30, beta: 0.95, divYield: "0.38%", eps: 109.5, upperCircuit: 3179.55, lowerCircuit: 2601.45 },
  TCS: { fullName: "Tata Consultancy Services Ltd.", sector: "Information Technology", pe: 31.8, mcap: "14.2L Cr", high52: 4585.00, low52: 3313.00, beta: 0.78, divYield: "1.45%", eps: 124.2, upperCircuit: 4345.20, lowerCircuit: 3555.20 },
  HDFCBANK: { fullName: "HDFC Bank Ltd.", sector: "Financial Services", pe: 18.2, mcap: "12.8L Cr", high52: 1794.00, low52: 1363.55, beta: 1.05, divYield: "1.16%", eps: 92.3, upperCircuit: 1848.00, lowerCircuit: 1512.00 },
  INFY: { fullName: "Infosys Ltd.", sector: "Information Technology", pe: 27.5, mcap: "6.4L Cr", high52: 1953.90, low52: 1358.35, beta: 0.89, divYield: "2.35%", eps: 56.0, upperCircuit: 1694.80, lowerCircuit: 1386.70 },
  ICICIBANK: { fullName: "ICICI Bank Ltd.", sector: "Financial Services", pe: 17.6, mcap: "7.9L Cr", high52: 1332.00, low52: 914.00, beta: 1.12, divYield: "0.89%", eps: 63.6, upperCircuit: 1232.30, lowerCircuit: 1008.30 },
  BHARTIARTL: { fullName: "Bharti Airtel Ltd.", sector: "Telecommunication", pe: 54.2, mcap: "7.1L Cr", high52: 1779.00, low52: 902.00, beta: 0.82, divYield: "0.66%", eps: 22.3, upperCircuit: 1331.40, lowerCircuit: 1089.40 },
  HINDUNILVR: { fullName: "Hindustan Unilever Ltd.", sector: "Consumer Defensive", pe: 58.1, mcap: "5.9L Cr", high52: 3035.00, low52: 2172.05, beta: 0.62, divYield: "1.58%", eps: 43.4, upperCircuit: 2772.00, lowerCircuit: 2268.00 },
  ITC: { fullName: "ITC Ltd.", sector: "Consumer Goods & FMCG", pe: 28.3, mcap: "5.4L Cr", high52: 528.55, low52: 399.30, beta: 0.68, divYield: "3.15%", eps: 15.4, upperCircuit: 479.15, lowerCircuit: 392.05 },
  SBIN: { fullName: "State Bank of India", sector: "Public Sector Banking", pe: 9.8, mcap: "7.0L Cr", high52: 912.10, low52: 555.30, beta: 1.25, divYield: "1.76%", eps: 79.6, upperCircuit: 858.25, lowerCircuit: 702.25 },
  LTIM: { fullName: "LTIMindtree Ltd.", sector: "Information Technology", pe: 33.4, mcap: "1.5L Cr", high52: 6442.00, low52: 4518.00, beta: 1.15, divYield: "1.27%", eps: 153.3, upperCircuit: 5632.00, lowerCircuit: 4608.00 },
  AAPL: { fullName: "Apple Inc.", sector: "Consumer Electronics & Tech", pe: 34.2, mcap: "$3.52T", high52: 237.23, low52: 164.08, beta: 1.08, divYield: "0.44%", eps: 6.68, upperCircuit: 251.30, lowerCircuit: 205.60 },
  NVDA: { fullName: "NVIDIA Corporation", sector: "Semiconductors & AI", pe: 55.6, mcap: "$3.31T", high52: 140.76, low52: 39.23, beta: 1.68, divYield: "0.03%", eps: 2.43, upperCircuit: 148.70, lowerCircuit: 121.70 },
  TSLA: { fullName: "Tesla, Inc.", sector: "Automotive & Energy", pe: 68.4, mcap: "$770B", high52: 271.00, low52: 138.80, beta: 2.34, divYield: "0.00%", eps: 3.55, upperCircuit: 267.00, lowerCircuit: 218.50 },
  MSFT: { fullName: "Microsoft Corporation", sector: "Software & Cloud", pe: 36.1, mcap: "$3.12T", high52: 468.35, low52: 326.93, beta: 0.92, divYield: "0.72%", eps: 11.60, upperCircuit: 460.80, lowerCircuit: 377.00 },
  GOOGL: { fullName: "Alphabet Inc.", sector: "Interactive Media & Cloud", pe: 24.3, mcap: "$2.05T", high52: 191.75, low52: 120.21, beta: 1.05, divYield: "0.48%", eps: 6.85, upperCircuit: 183.00, lowerCircuit: 149.80 },
  AMZN: { fullName: "Amazon.com, Inc.", sector: "E-Commerce & Cloud", pe: 42.8, mcap: "$1.95T", high52: 201.20, low52: 118.35, beta: 1.14, divYield: "0.00%", eps: 4.38, upperCircuit: 206.30, lowerCircuit: 168.80 },
  META: { fullName: "Meta Platforms, Inc.", sector: "Social Media & Metaverse", pe: 27.9, mcap: "$1.48T", high52: 602.95, low52: 279.40, beta: 1.22, divYield: "0.34%", eps: 21.00, upperCircuit: 643.80, lowerCircuit: 526.80 },
  NFLX: { fullName: "Netflix, Inc.", sector: "Entertainment & Streaming", pe: 44.5, mcap: "$308B", high52: 736.00, low52: 344.73, beta: 1.28, divYield: "0.00%", eps: 16.01, upperCircuit: 783.60, lowerCircuit: 641.10 },
};

const StockAnalyticsModal = ({ stockName, stockData, onClose, onOpenBuyWindow }) => {
  const [activeTab, setActiveTab] = useState("chart"); // "chart" | "depth" | "fundamentals"
  const [timeframe, setTimeframe] = useState("1D");

  const symbol = stockName || (stockData && stockData.name) || "RELIANCE";
  const price = stockData?.price || 2890.50;
  const percent = stockData?.percent || "+1.25%";
  const isDown = stockData?.isDown ?? (percent.startsWith("-"));
  const isNasdaq = stockData?.market === "NASDAQ" || ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMZN", "META", "NFLX"].includes(symbol);
  const currency = isNasdaq ? "$" : "₹";
  const exchange = isNasdaq ? "NASDAQ" : "NSE";

  const profile = companyProfiles[symbol] || {
    fullName: `${symbol} Limited`,
    sector: "Diversified Equities",
    pe: 25.0,
    mcap: isNasdaq ? "$1.2T" : "5.0L Cr",
    high52: price * 1.25,
    low52: price * 0.75,
    beta: 1.0,
    divYield: "1.2%",
    eps: (price / 25).toFixed(2),
    upperCircuit: (price * 1.1).toFixed(2),
    lowerCircuit: (price * 0.9).toFixed(2),
  };

  const orderBook = useMemo(() => {
    return generateOrderBook(price);
  }, [price]);

  const stockObj = {
    symbol,
    name: profile.fullName,
    price,
    change: isDown ? -Math.abs(price * 0.012) : Math.abs(price * 0.012),
    changePercent: parseFloat(percent.replace("%", "").replace("+", "")) || 0,
    currencySymbol: currency,
    exchange,
    country: isNasdaq ? "US" : "IN",
  };

  const range52w = profile.high52 - profile.low52 || 1;
  const current52Ratio = Math.min(100, Math.max(0, ((price - profile.low52) / range52w) * 100));

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        animation: "fadeIn 0.15s ease",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          width: "920px",
          maxWidth: "96vw",
          maxHeight: "92vh",
          borderRadius: "6px",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #eaeaea",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#fbfbfb",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: "600", color: "#333" }}>
                {symbol}
              </h2>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: "600",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  background: isNasdaq ? "#e3f2fd" : "#ede7f6",
                  color: isNasdaq ? "#1976d2" : "#512da8",
                  letterSpacing: "0.5px",
                }}
              >
                {exchange} • EQ
              </span>
              <span style={{ fontSize: "0.82rem", color: "#777" }}>
                {profile.fullName}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: "600", color: isDown ? "#df4949" : "#4caf50" }}>
                {currency}{price.toFixed(2)}
              </div>
              <div style={{ fontSize: "0.78rem", color: isDown ? "#df4949" : "#4caf50" }}>
                {percent}
              </div>
            </div>

            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => {
                  onClose();
                  onOpenBuyWindow(symbol, "BUY");
                }}
                style={{
                  background: "#4184f3",
                  color: "#fff",
                  border: "none",
                  padding: "6px 14px",
                  borderRadius: "3px",
                  fontSize: "0.8rem",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                Buy (B)
              </button>
              <button
                onClick={() => {
                  onClose();
                  onOpenBuyWindow(symbol, "SELL");
                }}
                style={{
                  background: "#ff5722",
                  color: "#fff",
                  border: "none",
                  padding: "6px 14px",
                  borderRadius: "3px",
                  fontSize: "0.8rem",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                Sell (S)
              </button>
              <button
                onClick={onClose}
                style={{
                  background: "transparent",
                  border: "1px solid #ddd",
                  borderRadius: "3px",
                  padding: "4px 10px",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                  color: "#666",
                  marginLeft: "4px",
                }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #eaeaea",
            padding: "0 24px",
            background: "#fff",
          }}
        >
          {[
            { id: "chart", label: "Chart & Technicals" },
            { id: "depth", label: "Market Depth (Level 2)" },
            { id: "fundamentals", label: "Fundamentals & Overview" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                border: "none",
                background: "transparent",
                padding: "12px 18px",
                fontSize: "0.85rem",
                fontWeight: activeTab === tab.id ? "600" : "400",
                color: activeTab === tab.id ? "#387ed1" : "#666",
                borderBottom: activeTab === tab.id ? "2px solid #387ed1" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body Content */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {activeTab === "chart" && (
            <div>
              {/* Timeframe selector */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  {["1D", "1W", "1M", "1Y", "ALL"].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      style={{
                        padding: "4px 10px",
                        fontSize: "0.75rem",
                        border: timeframe === tf ? "1px solid #387ed1" : "1px solid #ddd",
                        background: timeframe === tf ? "#e8f0fe" : "#fff",
                        color: timeframe === tf ? "#1a73e8" : "#555",
                        borderRadius: "3px",
                        cursor: "pointer",
                        fontWeight: timeframe === tf ? "600" : "400",
                      }}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: "0.75rem", color: "#888" }}>
                  Sector: <strong style={{ color: "#444" }}>{profile.sector}</strong>
                </div>
              </div>

              {/* Graphify Interactive Chart Engine */}
              <div style={{ border: "1px solid #eee", borderRadius: "4px", padding: "10px", background: "#fafafa" }}>
                <GraphifyChart
                  stock={stockObj}
                  isMockMode={true}
                  timeframe={timeframe}
                  onTimeframeChange={setTimeframe}
                />
              </div>
            </div>
          )}

          {activeTab === "depth" && (
            <div>
              <h4 style={{ margin: "0 0 16px 0", fontSize: "0.95rem", color: "#444", fontWeight: "500" }}>
                Order Book Depth (5 Best Bids & Asks)
              </h4>
              <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
                {/* Bids Table */}
                <div style={{ flex: 1, border: "1px solid #e0f2fe", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ background: "#f0f9ff", padding: "8px 12px", borderBottom: "1px solid #e0f2fe", fontWeight: "600", fontSize: "0.8rem", color: "#0369a1" }}>
                    BID (BUY ORDERS)
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", color: "#888", borderBottom: "1px solid #eee" }}>
                        <th style={{ padding: "6px 10px", textAlign: "left" }}>Orders</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>Qty</th>
                        <th style={{ padding: "6px 10px", textAlign: "right", color: "#0284c7" }}>Bid Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(orderBook?.bids || []).map((b, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "6px 10px", color: "#666" }}>{b.orders || 1}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right" }}>{(b.quantity || b.qty || 0).toLocaleString()}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: "600", color: "#0284c7" }}>
                            {currency}{(b.price || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f0f9ff", fontWeight: "600" }}>
                        <td style={{ padding: "8px 10px" }}>Total</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                          {(orderBook?.totalBidQty || 0).toLocaleString()}
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Asks Table */}
                <div style={{ flex: 1, border: "1px solid #fee2e2", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ background: "#fef2f2", padding: "8px 12px", borderBottom: "1px solid #fee2e2", fontWeight: "600", fontSize: "0.8rem", color: "#b91c1c" }}>
                    OFFER / ASK (SELL ORDERS)
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", color: "#888", borderBottom: "1px solid #eee" }}>
                        <th style={{ padding: "6px 10px", textAlign: "left", color: "#dc2626" }}>Ask Price</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>Qty</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(orderBook?.asks || []).map((a, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "6px 10px", fontWeight: "600", color: "#dc2626" }}>
                            {currency}{(a.price || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "right" }}>{(a.quantity || a.qty || 0).toLocaleString()}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", color: "#666" }}>{a.orders || 1}</td>
                        </tr>
                      ))}
                      <tr style={{ background: "#fef2f2", fontWeight: "600" }}>
                        <td></td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                          {(orderBook?.totalAskQty || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>Total</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Total Ratio Bar */}
              <div style={{ background: "#f8f9fa", padding: "12px", borderRadius: "4px", border: "1px solid #eee" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "4px" }}>
                  <span style={{ color: "#0284c7", fontWeight: "600" }}>Buyers: {(((orderBook?.totalBidQty || 1) / ((orderBook?.totalBidQty || 0) + (orderBook?.totalAskQty || 0) || 1)) * 100).toFixed(1)}%</span>
                  <span style={{ color: "#dc2626", fontWeight: "600" }}>Sellers: {(((orderBook?.totalAskQty || 1) / ((orderBook?.totalBidQty || 0) + (orderBook?.totalAskQty || 0) || 1)) * 100).toFixed(1)}%</span>
                </div>
                <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", background: "#e0e0e0" }}>
                  <div style={{ width: `${(((orderBook?.totalBidQty || 1) / ((orderBook?.totalBidQty || 0) + (orderBook?.totalAskQty || 0) || 1)) * 100)}%`, background: "#0284c7" }}></div>
                  <div style={{ width: `${(((orderBook?.totalAskQty || 1) / ((orderBook?.totalBidQty || 0) + (orderBook?.totalAskQty || 0) || 1)) * 100)}%`, background: "#dc2626" }}></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "fundamentals" && (
            <div>
              {/* 52W Range Card */}
              <div style={{ background: "#fafafa", padding: "16px", borderRadius: "4px", border: "1px solid #eee", marginBottom: "20px" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: "600", color: "#444", marginBottom: "10px" }}>
                  52-Week Range Performance
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#666", marginBottom: "6px" }}>
                  <span>52W Low: <strong style={{ color: "#df4949" }}>{currency}{profile.low52.toFixed(2)}</strong></span>
                  <span>Current: <strong style={{ color: "#333" }}>{currency}{price.toFixed(2)}</strong></span>
                  <span>52W High: <strong style={{ color: "#4caf50" }}>{currency}{profile.high52.toFixed(2)}</strong></span>
                </div>
                <div style={{ height: "6px", background: "#e0e0e0", borderRadius: "3px", position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      width: `${current52Ratio}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #df4949, #ff9800, #4caf50)",
                      borderRadius: "3px",
                    }}
                  ></div>
                  <div
                    style={{
                      position: "absolute",
                      left: `${current52Ratio}%`,
                      top: "-4px",
                      width: "14px",
                      height: "14px",
                      background: "#387ed1",
                      borderRadius: "50%",
                      transform: "translateX(-50%)",
                      border: "2px solid #fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                    }}
                  ></div>
                </div>
              </div>

              {/* Fundamentals Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px" }}>
                {[
                  { label: "Market Cap", value: profile.mcap },
                  { label: "P/E Ratio (TTM)", value: profile.pe },
                  { label: "EPS (TTM)", value: `${currency}${profile.eps}` },
                  { label: "Dividend Yield", value: profile.divYield },
                  { label: "Beta (1Y)", value: profile.beta },
                  { label: "Upper Circuit", value: `${currency}${profile.upperCircuit}` },
                  { label: "Lower Circuit", value: `${currency}${profile.lowerCircuit}` },
                  { label: "Sector", value: profile.sector },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "12px",
                      background: "#fff",
                      border: "1px solid #eee",
                      borderRadius: "4px",
                    }}
                  >
                    <div style={{ fontSize: "0.72rem", color: "#888", marginBottom: "4px", textTransform: "uppercase" }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: "0.95rem", fontWeight: "600", color: "#333" }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockAnalyticsModal;
