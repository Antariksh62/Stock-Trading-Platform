import React, { useState, useContext, useMemo } from "react";
import { MarketContext } from "../../context/MarketContext";
import { GraphifyChart } from "../graphify/GraphifyChart";
import { GraphifyDepthChart } from "../graphify/GraphifyDepthChart";
import { MarketDepthTable } from "./MarketDepthTable";
import { OrderExecutionPanel } from "./OrderExecutionPanel";
import { generateOrderBook } from "../../services/simulationEngine";

export const StockDetailView = ({ initialTradeMode }) => {
  const { selectedStock, timeframe, setTimeframe, isMockMode } = useContext(MarketContext);
  const [activeTab, setActiveTab] = useState("chart"); // "chart" | "depth" | "stats"

  const orderBook = useMemo(() => {
    return generateOrderBook(selectedStock.price);
  }, [selectedStock.price]);

  if (!selectedStock) return null;

  const isPositive = selectedStock.change >= 0;

  // 52W Range Progress bar ratio
  const range52w = selectedStock.fiftyTwoWeekHigh - selectedStock.fiftyTwoWeekLow || 1;
  const current52wRatio = Math.min(
    100,
    Math.max(0, ((selectedStock.price - selectedStock.fiftyTwoWeekLow) / range52w) * 100)
  );

  return (
    <div className="stock-detail-view">
      {/* Asset Header Banner */}
      <div className="asset-header-banner">
        <div className="asset-primary-info">
          <div className="asset-title-row">
            <h1 className="asset-symbol">{selectedStock.symbol}</h1>
            <span className={`market-badge ${selectedStock.market === "NASDAQ" ? "badge-nasdaq" : "badge-nse"}`}>
              {selectedStock.exchange} • {selectedStock.country}
            </span>
          </div>
          <div className="asset-company-name">{selectedStock.name}</div>
        </div>

        {/* Live Price Block */}
        <div className="asset-price-block">
          <div className={`asset-live-price ${isPositive ? "text-emerald" : "text-crimson"}`}>
            {selectedStock.currencySymbol}{selectedStock.price.toFixed(2)}
          </div>
          <div className="asset-change-row">
            <span className={`asset-change-val ${isPositive ? "text-emerald" : "text-crimson"}`}>
              {isPositive ? "+" : ""}{selectedStock.change.toFixed(2)} ({isPositive ? "+" : ""}{selectedStock.changePercent.toFixed(2)}%)
            </span>
            <span className="text-muted small">• Live</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Chart & Order Ticket */}
      <div className="detail-main-grid">
        {/* Left / Center Section: Chart & Analytics */}
        <div className="chart-analytics-section">
          {/* Sub Navigation Tabs */}
          <div className="detail-sub-tabs">
            <button
              className={`detail-tab ${activeTab === "chart" ? "active" : ""}`}
              onClick={() => setActiveTab("chart")}
            >
              Interactive Graphify Chart
            </button>
            <button
              className={`detail-tab ${activeTab === "depth" ? "active" : ""}`}
              onClick={() => setActiveTab("depth")}
            >
              Order Depth & Book
            </button>
            <button
              className={`detail-tab ${activeTab === "stats" ? "active" : ""}`}
              onClick={() => setActiveTab("stats")}
            >
              Key Fundamentals
            </button>
          </div>

          {/* Active Tab View */}
          {activeTab === "chart" && (
            <GraphifyChart
              stock={selectedStock}
              isMockMode={isMockMode}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
            />
          )}

          {activeTab === "depth" && (
            <div className="depth-analytics-card">
              <GraphifyDepthChart orderBook={orderBook} />
              <MarketDepthTable orderBook={orderBook} currencySymbol={selectedStock.currencySymbol} />
            </div>
          )}

          {activeTab === "stats" && (
            <div className="fundamentals-grid">
              <div className="fund-card">
                <span className="fund-label">Market Capitalization</span>
                <span className="fund-val">{selectedStock.currencySymbol}{selectedStock.marketCap}</span>
              </div>
              <div className="fund-card">
                <span className="fund-label">P/E Ratio</span>
                <span className="fund-val">{selectedStock.peRatio}</span>
              </div>
              <div className="fund-card">
                <span className="fund-label">Today's Volume</span>
                <span className="fund-val">{selectedStock.volume}</span>
              </div>
              <div className="fund-card">
                <span className="fund-label">Day Range</span>
                <span className="fund-val">
                  {selectedStock.currencySymbol}{selectedStock.low.toFixed(2)} - {selectedStock.currencySymbol}{selectedStock.high.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Key Fundamentals Snapshot Strip */}
          <div className="metrics-strip">
            <div className="metric-item">
              <span className="m-label">Open</span>
              <span className="m-val">{selectedStock.currencySymbol}{selectedStock.open.toFixed(2)}</span>
            </div>
            <div className="metric-item">
              <span className="m-label">High</span>
              <span className="m-val text-emerald">{selectedStock.currencySymbol}{selectedStock.high.toFixed(2)}</span>
            </div>
            <div className="metric-item">
              <span className="m-label">Low</span>
              <span className="m-val text-crimson">{selectedStock.currencySymbol}{selectedStock.low.toFixed(2)}</span>
            </div>
            <div className="metric-item">
              <span className="m-label">Prev Close</span>
              <span className="m-val">{selectedStock.currencySymbol}{selectedStock.previousClose.toFixed(2)}</span>
            </div>
            <div className="metric-item">
              <span className="m-label">Volume</span>
              <span className="m-val">{selectedStock.volume}</span>
            </div>
            <div className="metric-item flex-grow-1">
              <div className="range-header">
                <span className="m-label">52W Range</span>
                <span className="m-val small">
                  {selectedStock.currencySymbol}{selectedStock.fiftyTwoWeekLow} - {selectedStock.currencySymbol}{selectedStock.fiftyTwoWeekHigh}
                </span>
              </div>
              <div className="range-bar-bg">
                <div className="range-bar-fill" style={{ width: `${current52wRatio}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Section: Interactive Order Execution Ticket */}
        <div className="order-ticket-section">
          <OrderExecutionPanel stock={selectedStock} initialMode={initialTradeMode || "BUY"} />
        </div>
      </div>
    </div>
  );
};
