import React from "react";

export const MarketDepthTable = ({ orderBook, currencySymbol = "$" }) => {
  if (!orderBook) return null;

  return (
    <div className="depth-table-container">
      <div className="depth-table-grid">
        {/* Bid Side */}
        <div className="depth-column bid-side">
          <div className="column-title text-emerald">BID ORDERS</div>
          <div className="depth-header-row">
            <span>Orders</span>
            <span>Qty</span>
            <span>Bid Price</span>
          </div>
          {orderBook.bids.map((b, i) => (
            <div className="depth-data-row bid-row" key={`bid-${i}`}>
              <span className="text-muted">{b.orders}</span>
              <span className="qty-col">{b.quantity}</span>
              <span className="price-col text-emerald">
                {currencySymbol}{b.price.toFixed(2)}
              </span>
            </div>
          ))}
          <div className="depth-total-row">
            <span>Total Qty</span>
            <span className="text-emerald fw-bold">{orderBook.totalBidQty}</span>
          </div>
        </div>

        {/* Ask Side */}
        <div className="depth-column ask-side">
          <div className="column-title text-crimson">ASK ORDERS</div>
          <div className="depth-header-row">
            <span>Ask Price</span>
            <span>Qty</span>
            <span>Orders</span>
          </div>
          {orderBook.asks.map((a, i) => (
            <div className="depth-data-row ask-row" key={`ask-${i}`}>
              <span className="price-col text-crimson">
                {currencySymbol}{a.price.toFixed(2)}
              </span>
              <span className="qty-col">{a.quantity}</span>
              <span className="text-muted">{a.orders}</span>
            </div>
          ))}
          <div className="depth-total-row">
            <span>Total Qty</span>
            <span className="text-crimson fw-bold">{orderBook.totalAskQty}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
