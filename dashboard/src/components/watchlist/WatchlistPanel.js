import React, { useState, useContext, useMemo } from "react";
import { MarketContext } from "../../context/MarketContext";
import { WatchlistItem } from "./WatchlistItem";

export const WatchlistPanel = ({ onQuickTrade }) => {
  const {
    stocks,
    selectedStock,
    setSelectedStock,
    marketFilter,
    setMarketFilter,
    searchQuery,
    setSearchQuery,
  } = useContext(MarketContext);

  const [sortBy, setSortBy] = useState("default"); // default, gainers, losers, volume

  const filteredStocks = useMemo(() => {
    return stocks
      .filter((s) => {
        const matchesSearch =
          s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesMarket =
          marketFilter === "ALL" || s.market === marketFilter;
        return matchesSearch && matchesMarket;
      })
      .sort((a, b) => {
        if (sortBy === "gainers") return b.changePercent - a.changePercent;
        if (sortBy === "losers") return a.changePercent - b.changePercent;
        if (sortBy === "name") return a.symbol.localeCompare(b.symbol);
        return 0;
      });
  }, [stocks, searchQuery, marketFilter, sortBy]);

  const usCount = stocks.filter((s) => s.market === "NASDAQ").length;
  const nseCount = stocks.filter((s) => s.market === "NSE").length;

  return (
    <div className="watchlist-panel">
      {/* Search & Header */}
      <div className="watchlist-header">
        <div className="search-box">
          <svg className="search-icon" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search US or Indian equities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button className="clear-btn" onClick={() => setSearchQuery("")}>
              ✕
            </button>
          )}
        </div>

        {/* Market Filter Tabs */}
        <div className="market-tabs">
          <button
            className={`tab-btn ${marketFilter === "ALL" ? "active" : ""}`}
            onClick={() => setMarketFilter("ALL")}
          >
            All <span className="tab-count">{stocks.length}</span>
          </button>
          <button
            className={`tab-btn ${marketFilter === "NASDAQ" ? "active" : ""}`}
            onClick={() => setMarketFilter("NASDAQ")}
          >
            US Nasdaq <span className="tab-count">{usCount}</span>
          </button>
          <button
            className={`tab-btn ${marketFilter === "NSE" ? "active" : ""}`}
            onClick={() => setMarketFilter("NSE")}
          >
            Indian NSE <span className="tab-count">{nseCount}</span>
          </button>
        </div>

        {/* Sub-bar Sort Controls */}
        <div className="sort-bar">
          <span className="sort-label">Sort:</span>
          <button
            className={`sort-pill ${sortBy === "default" ? "active" : ""}`}
            onClick={() => setSortBy("default")}
          >
            Default
          </button>
          <button
            className={`sort-pill ${sortBy === "gainers" ? "active" : ""}`}
            onClick={() => setSortBy("gainers")}
          >
            Top Gainers
          </button>
          <button
            className={`sort-pill ${sortBy === "losers" ? "active" : ""}`}
            onClick={() => setSortBy("losers")}
          >
            Top Losers
          </button>
        </div>
      </div>

      {/* Stock Items List */}
      <div className="watchlist-list">
        {filteredStocks.length === 0 ? (
          <div className="empty-watchlist">
            <p>No equities found matching "{searchQuery}"</p>
          </div>
        ) : (
          filteredStocks.map((stock) => (
            <WatchlistItem
              key={stock.symbol}
              stock={stock}
              isSelected={selectedStock?.symbol === stock.symbol}
              onSelect={setSelectedStock}
              onQuickTrade={onQuickTrade}
            />
          ))
        )}
      </div>
    </div>
  );
};
