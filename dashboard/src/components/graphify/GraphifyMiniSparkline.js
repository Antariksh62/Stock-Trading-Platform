import React from "react";

export const GraphifyMiniSparkline = ({ data = [], isPositive = true, width = 90, height = 32 }) => {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * (width - 4) + 2;
    const y = height - ((val - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  });

  const polylineStr = points.join(" ");
  const strokeColor = isPositive ? "#10B981" : "#EF4444";
  const gradientId = `spark-grad-${Math.random().toString(36).substr(2, 9)}`;

  // Area under curve points
  const firstX = 2;
  const lastX = width - 2;
  const areaPoints = `${firstX},${height} ${polylineStr} ${lastX},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polylineStr}
      />
    </svg>
  );
};
