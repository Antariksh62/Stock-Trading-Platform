import React, { useState, useContext } from "react";
import { MarketContext } from "../../context/MarketContext";

export const OrderExecutionPanel = ({ stock, initialMode = "BUY", onClose }) => {
  const { executePaperTrade, portfolio } = useContext(MarketContext);
  const [tradeType, setTradeType] = useState(initialMode); // "BUY" | "SELL"
  const [orderType, setOrderType] = useState("MARKET"); // "MARKET" | "LIMIT"
  const [qty, setQty] = useState(10);
  const [limitPrice, setLimitPrice] = useState(stock.price);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: string }

  const executionPrice = orderType === "MARKET" ? stock.price : Number(limitPrice) || stock.price;
  const totalAmount = (Number(qty) || 0) * executionPrice;

  const isUSD = stock.currency === "USD";
  const availableCash = isUSD ? portfolio.cashUSD : portfolio.cashINR;
  const userHolding = portfolio.holdings.find((h) => h.symbol === stock.symbol);
  const ownedQty = userHolding ? userHolding.qty : 0;

  const handleExecute = (e) => {
    e.preventDefault();
    if (qty <= 0) {
      setFeedback({ type: "error", message: "Please enter a valid quantity" });
      return;
    }

    const result = executePaperTrade({
      symbol: stock.symbol,
      qty: Number(qty),
      price: executionPrice,
      type: tradeType,
      orderType,
    });

    if (result.success) {
      setFeedback({ type: "success", message: result.message });
      setTimeout(() => {
        setFeedback(null);
        if (onClose) onClose();
      }, 1400);
    } else {
      setFeedback({ type: "error", message: result.message });
    }
  };

  return (
    <div className="order-ticket-container">
      {/* Trade Type Tabs (BUY vs SELL) */}
      <div className="ticket-type-tabs">
        <button
          type="button"
          className={`tab-btn-buy ${tradeType === "BUY" ? "active-buy" : ""}`}
          onClick={() => { setTradeType("BUY"); setFeedback(null); }}
        >
          BUY {stock.symbol}
        </button>
        <button
          type="button"
          className={`tab-btn-sell ${tradeType === "SELL" ? "active-sell" : ""}`}
          onClick={() => { setTradeType("SELL"); setFeedback(null); }}
        >
          SELL {stock.symbol}
        </button>
      </div>

      <form onSubmit={handleExecute} className="ticket-body">
        {/* Order Type Selector */}
        <div className="ticket-field-group">
          <label className="field-label">Order Type</label>
          <div className="btn-group-segmented">
            <button
              type="button"
              className={`segmented-btn ${orderType === "MARKET" ? "active" : ""}`}
              onClick={() => setOrderType("MARKET")}
            >
              Market
            </button>
            <button
              type="button"
              className={`segmented-btn ${orderType === "LIMIT" ? "active" : ""}`}
              onClick={() => setOrderType("LIMIT")}
            >
              Limit
            </button>
          </div>
        </div>

        {/* Quantity Input */}
        <div className="ticket-field-group">
          <div className="field-label-row">
            <label className="field-label">Quantity</label>
            {tradeType === "SELL" && (
              <span className="owned-hint text-muted">Owned: {ownedQty} shares</span>
            )}
          </div>
          <div className="qty-input-wrapper">
            <input
              type="number"
              min="1"
              max={tradeType === "SELL" ? ownedQty || 1 : 10000}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 0))}
              className="ticket-input"
            />
            <div className="quick-qty-pills">
              {[10, 50, 100].map((pillVal) => (
                <button
                  key={pillVal}
                  type="button"
                  className="qty-pill"
                  onClick={() => setQty(pillVal)}
                >
                  +{pillVal}
                </button>
              ))}
              {tradeType === "SELL" && ownedQty > 0 && (
                <button
                  type="button"
                  className="qty-pill text-emerald"
                  onClick={() => setQty(ownedQty)}
                >
                  Max
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Limit Price Input if LIMIT selected */}
        {orderType === "LIMIT" && (
          <div className="ticket-field-group">
            <label className="field-label">Limit Price ({stock.currencySymbol})</label>
            <input
              type="number"
              step="0.05"
              value={limitPrice}
              onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
              className="ticket-input"
            />
          </div>
        )}

        {/* Cost Estimation Summary */}
        <div className="ticket-summary-box">
          <div className="summary-row">
            <span className="text-muted">Estimated Total:</span>
            <span className="fw-semibold text-white">
              {stock.currencySymbol}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="summary-row">
            <span className="text-muted">Available Cash:</span>
            <span className={availableCash < totalAmount && tradeType === "BUY" ? "text-crimson" : "text-muted"}>
              {stock.currencySymbol}{availableCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Feedback Message */}
        {feedback && (
          <div className={`ticket-alert ${feedback.type === "success" ? "alert-success" : "alert-danger"}`}>
            {feedback.message}
          </div>
        )}

        {/* Action Button */}
        <button
          type="submit"
          className={`ticket-submit-btn ${tradeType === "BUY" ? "btn-submit-buy" : "btn-submit-sell"}`}
        >
          {tradeType === "BUY" ? "Place Buy Order" : "Place Sell Order"}
        </button>
      </form>
    </div>
  );
};
