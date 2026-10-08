import React, { useState, useContext } from "react";
import { MarketContext, MarketContextProvider } from "../context/MarketContext";
import { useStockTicker } from "../hooks/useStockTicker";
import { TopBarNav } from "./header/TopBarNav";
import { ApiKeyModal } from "./header/ApiKeyModal";
import { WatchlistPanel } from "./watchlist/WatchlistPanel";
import { StockDetailView } from "./details/StockDetailView";
import { PaperPortfolioView } from "./portfolio/PaperPortfolioView";
import "../styles/darkTheme.css";

const TradingDashboardContent = () => {
  const {
    stocks,
    setStocks,
    isMockMode,
    refreshQuota,
    isApiKeyModalOpen,
    setIsApiKeyModalOpen,
    setSelectedStock,
  } = useContext(MarketContext);

  const [activeView, setActiveView] = useState("trade"); // "trade" | "portfolio"
  const [quickTradeMode, setQuickTradeMode] = useState("BUY");

  // Activate custom hook for stock ticker polling & simulation
  useStockTicker({
    stocks,
    setStocks,
    isMockMode,
    refreshQuota,
  });

  const handleQuickTrade = (stock, mode) => {
    setSelectedStock(stock);
    setQuickTradeMode(mode);
    setActiveView("trade");
  };

  return (
    <div className="app-container">
      <TopBarNav activeView={activeView} setActiveView={setActiveView} />

      {activeView === "trade" ? (
        <main className="main-workspace-grid">
          <WatchlistPanel onQuickTrade={handleQuickTrade} />
          <StockDetailView initialTradeMode={quickTradeMode} />
        </main>
      ) : (
        <main className="main-workspace-grid" style={{ gridTemplateColumns: "1fr" }}>
          <PaperPortfolioView />
        </main>
      )}

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
      />
    </div>
  );
};

export const TradingDashboardApp = () => {
  return (
    <MarketContextProvider>
      <TradingDashboardContent />
    </MarketContextProvider>
  );
};

export default TradingDashboardApp;
