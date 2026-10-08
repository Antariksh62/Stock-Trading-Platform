import React, { useState, useEffect } from "react";
import { GraphifyMiniSparkline } from "../graphify/GraphifyMiniSparkline";

export const WatchlistItem = ({ stock, isSelected, onSelect, onQuickTrade }) => {
  const [flash, setFlash] = useState(null); // 'flash-up' | 'flash-down'

  useEffect(() => {
    if (stock.lastTickTime) {
      setFlash(stock.tickDirection === "up" ? "flash-up" : "flash-down");
      const timer = setTimeout(() => setFlash(null), 800);
      return () => clearTimeout(timer);
    }
  }, [stock.price, stock.lastTickTime, stock.tickDirection]);

  const isPositive = stock.change >= 0;

  return (
    <div
      className={`watchlist-item ${isSelected ? "selected" : ""} ${flash || ""}`}
      onClick={() => onSelect(stock)}
    >
      <div className="item-left">
        <div className="item-symbol-row">
          <span className="symbol-name">{stock.symbol}</span>
          <span className={`market-tag ${stock.market === "NASDAQ" ? "tag-nasdaq" : "tag-nse"}`}>
            {stock.market}
          </span>
        </div>
        <div className="stock-full-name">{stock.name}</div>
      </div>

      <div className="item-center">
        <GraphifyMiniSparkline
          data={stock.sparkline}
          isPositive={isPositive}
          width={75}
          height={28}
        />
      </div>

      <div className="item-right">
        <div className={`price-text ${isPositive ? "text-emerald" : "text-crimson"}`}>
          {stock.currencySymbol}{stock.price.toFixed(2)}
        </div>
        <div className={`change-badge ${isPositive ? "badge-emerald" : "badge-crimson"}`}>
          {isPositive ? "+" : ""}{stock.changePercent.toFixed(2)}%
        </div>
      </div>

      {/* Quick Trade Hover Overlay */}
      <div className="quick-trade-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="btn-quick-buy"
          onClick={() => onQuickTrade(stock, "BUY")}
          title="Buy Stock"
        >
          B
        </button>
        <button
          className="btn-quick-sell"
          onClick={() => onQuickTrade(stock, "SELL")}
          title="Sell Stock"
        >
          S
        </button>
      </div>
    </div>
  );
};
