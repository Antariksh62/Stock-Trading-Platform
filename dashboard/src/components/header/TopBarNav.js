import React, { useContext } from "react";
import { MarketContext } from "../../context/MarketContext";

export const TopBarNav = ({ activeView, setActiveView }) => {
  const {
    indices,
    isMockMode,
    toggleMockMode,
    quotaInfo,
    portfolio,
    setIsApiKeyModalOpen,
  } = useContext(MarketContext);

  return (
    <header className="topbar-nav">
      {/* Brand & Market Tickers */}
      <div className="topbar-left">
        <div className="brand-logo-group" onClick={() => setActiveView("trade")}>
          <div className="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 4L12 12L20 4" stroke="#00F0FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 20L12 12L20 20" stroke="#387ED1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-title">APEX TRADER</span>
            <span className="brand-badge">GLOBAL MERN</span>
          </div>
        </div>

        {/* Global Market Indices Ticker Strip */}
        <div className="indices-strip">
          {indices.map((idx) => (
            <div className="index-pill" key={idx.name}>
              <span className="index-name">{idx.name}</span>
              <span className="index-val">{idx.value}</span>
              <span className={idx.isUp ? "text-emerald small" : "text-crimson small"}>
                {idx.percent}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Center Nav Views */}
      <div className="topbar-center">
        <button
          className={`nav-tab-btn ${activeView === "trade" ? "active" : ""}`}
          onClick={() => setActiveView("trade")}
        >
          Trading Terminal
        </button>
        <button
          className={`nav-tab-btn ${activeView === "portfolio" ? "active" : ""}`}
          onClick={() => setActiveView("portfolio")}
        >
          Paper Portfolio
          <span className="holdings-count-pill">{portfolio.holdings.length}</span>
        </button>
      </div>

      {/* Right Controls: Quota & Mock Toggle */}
      <div className="topbar-right">
        {/* Mock Mode Switch */}
        <button
          className={`mock-toggle-pill ${isMockMode ? "mock-active" : "live-active"}`}
          onClick={toggleMockMode}
          title="Toggle Simulation vs Live Twelve Data API"
        >
          <span className="indicator-dot" />
          <span className="toggle-label">{isMockMode ? "Simulation Mode" : "Live API"}</span>
        </button>

        {/* Twelve Data Quota Button */}
        <button
          className="api-quota-badge"
          onClick={() => setIsApiKeyModalOpen(true)}
          title="Twelve Data Free Tier Limit (800 calls/day)"
        >
          <span className="quota-title">Twelve Data:</span>
          <span className="quota-count">{quotaInfo.remaining} left</span>
        </button>

        {/* Settings Icon */}
        <button
          className="icon-action-btn"
          onClick={() => setIsApiKeyModalOpen(true)}
          title="Configure API Key"
        >
          ⚙
        </button>
      </div>
    </header>
  );
};
