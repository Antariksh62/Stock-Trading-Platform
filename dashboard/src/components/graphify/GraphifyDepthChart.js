import React from "react";

export const GraphifyDepthChart = ({ orderBook, width = 360, height = 140 }) => {
  if (!orderBook || !orderBook.bids || !orderBook.asks) return null;

  const { bids, asks } = orderBook;
  const padding = { top: 15, right: 10, bottom: 20, left: 10 };

  // Calculate cumulative quantities
  let cumBid = 0;
  const bidPoints = [...bids].reverse().map((b) => {
    cumBid += b.quantity;
    return { price: b.price, cumQty: cumBid };
  });

  let cumAsk = 0;
  const askPoints = asks.map((a) => {
    cumAsk += a.quantity;
    return { price: a.price, cumQty: cumAsk };
  });

  const maxQty = Math.max(cumBid, cumAsk) * 1.1 || 1;
  const midX = width / 2;

  // Generate Bid Area (Left half, green)
  const bidAreaPoints = [
    `${padding.left},${height - padding.bottom}`,
    ...bidPoints.map((p, idx) => {
      const x = padding.left + (idx / Math.max(1, bidPoints.length - 1)) * (midX - padding.left);
      const y = height - padding.bottom - (p.cumQty / maxQty) * (height - padding.top - padding.bottom);
      return `${x},${y}`;
    }),
    `${midX},${height - padding.bottom}`,
  ].join(" ");

  // Generate Ask Area (Right half, red)
  const askAreaPoints = [
    `${midX},${height - padding.bottom}`,
    ...askPoints.map((p, idx) => {
      const x = midX + (idx / Math.max(1, askPoints.length - 1)) * (width - padding.right - midX);
      const y = height - padding.bottom - (p.cumQty / maxQty) * (height - padding.top - padding.bottom);
      return `${x},${y}`;
    }),
    `${width - padding.right},${height - padding.bottom}`,
  ].join(" ");

  return (
    <div className="depth-chart-wrapper">
      <div className="depth-chart-header">
        <span className="text-emerald">Bids ({orderBook.bidRatio}%)</span>
        <span className="text-muted">Market Depth</span>
        <span className="text-crimson">Asks ({orderBook.askRatio}%)</span>
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="bidDepthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="askDepthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#EF4444" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#EF4444" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Center Divider */}
        <line x1={midX} y1={padding.top} x2={midX} y2={height - padding.bottom} stroke="#334155" strokeDasharray="3 3" />

        {/* Bid Depth Wall */}
        <polygon points={bidAreaPoints} fill="url(#bidDepthGrad)" />
        <polyline
          fill="none"
          stroke="#10B981"
          strokeWidth="2"
          points={bidPoints.map((p, idx) => {
            const x = padding.left + (idx / Math.max(1, bidPoints.length - 1)) * (midX - padding.left);
            const y = height - padding.bottom - (p.cumQty / maxQty) * (height - padding.top - padding.bottom);
            return `${x},${y}`;
          }).join(" ")}
        />

        {/* Ask Depth Wall */}
        <polygon points={askAreaPoints} fill="url(#askDepthGrad)" />
        <polyline
          fill="none"
          stroke="#EF4444"
          strokeWidth="2"
          points={askPoints.map((p, idx) => {
            const x = midX + (idx / Math.max(1, askPoints.length - 1)) * (width - padding.right - midX);
            const y = height - padding.bottom - (p.cumQty / maxQty) * (height - padding.top - padding.bottom);
            return `${x},${y}`;
          }).join(" ")}
        />
      </svg>
    </div>
  );
};
