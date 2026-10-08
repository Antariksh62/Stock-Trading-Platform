import React, { useState, useEffect, useMemo, useRef } from "react";
import { generateHistoricalCandles } from "../../services/simulationEngine";
import { twelveDataService } from "../../services/twelveDataService";

export const GraphifyChart = ({ stock, isMockMode, timeframe = "1D", onTimeframeChange }) => {
  const [candles, setCandles] = useState([]);
  const [chartType, setChartType] = useState("candlestick"); // "candlestick" | "line"
  const [showSMA, setShowSMA] = useState(true);
  const [showEMA, setShowEMA] = useState(false);
  const [hoveredCandle, setHoveredCandle] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, visible: false });
  const containerRef = useRef(null);

  // Generate / Fetch Candle Data whenever stock, timeframe, or mock mode alters
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (isMockMode) {
        const generated = generateHistoricalCandles(stock.price, timeframe, 50);
        if (isMounted) setCandles(generated);
      } else {
        const intervalMap = { "1D": "5min", "1W": "30min", "1M": "2h", "1Y": "1day", "ALL": "1week" };
        const result = await twelveDataService.fetchTimeSeries(stock.symbol, intervalMap[timeframe] || "5min", 40);
        if (isMounted) {
          if (result.success && result.data && result.data.length > 0) {
            setCandles(result.data);
          } else {
            // Fallback to simulation generator if live Twelve Data quota is exhausted
            setCandles(generateHistoricalCandles(stock.price, timeframe, 50));
          }
        }
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [stock.symbol, stock.price, timeframe, isMockMode]);

  // Update last candle price when live price ticks
  useEffect(() => {
    setCandles((prev) => {
      if (!prev || prev.length === 0) return prev;
      const updated = [...prev];
      const last = { ...updated[updated.length - 1] };
      last.close = stock.price;
      last.high = Math.max(last.high, stock.price);
      last.low = Math.min(last.low, stock.price);
      last.isBullish = last.close >= last.open;
      updated[updated.length - 1] = last;
      return updated;
    });
  }, [stock.price]);

  // Calculate Simple Moving Average (SMA 20)
  const smaData = useMemo(() => {
    if (!showSMA || candles.length < 10) return [];
    const period = 14;
    return candles.map((c, idx) => {
      if (idx < period - 1) return null;
      const slice = candles.slice(idx - period + 1, idx + 1);
      const sum = slice.reduce((acc, curr) => acc + curr.close, 0);
      return Number((sum / period).toFixed(2));
    });
  }, [candles, showSMA]);

  // Calculate Exponential Moving Average (EMA 20)
  const emaData = useMemo(() => {
    if (!showEMA || candles.length < 10) return [];
    const period = 20;
    const k = 2 / (period + 1);
    let prevEMA = candles[0].close;
    return candles.map((c, idx) => {
      if (idx === 0) return c.close;
      const currentEMA = c.close * k + prevEMA * (1 - k);
      prevEMA = currentEMA;
      return Number(currentEMA.toFixed(2));
    });
  }, [candles, showEMA]);

  // Dimensions & Scales
  const width = 860;
  const height = 420;
  const chartHeight = 310;
  const volumeHeight = 70;
  const padding = { top: 20, right: 65, bottom: 30, left: 15 };

  const { minPrice, maxPrice, maxVolume } = useMemo(() => {
    if (candles.length === 0) return { minPrice: 0, maxPrice: 100, maxVolume: 100 };
    const lows = candles.map((c) => c.low);
    const highs = candles.map((c) => c.high);
    const vols = candles.map((c) => c.volume);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const buffer = (max - min) * 0.08 || 1;
    return {
      minPrice: min - buffer,
      maxPrice: max + buffer,
      maxVolume: Math.max(...vols) * 1.2 || 1,
    };
  }, [candles]);

  const priceToY = (price) => {
    const range = maxPrice - minPrice || 1;
    return padding.top + (1 - (price - minPrice) / range) * chartHeight;
  };

  const volumeToY = (vol) => {
    const ratio = vol / maxVolume;
    return height - padding.bottom - ratio * volumeHeight;
  };

  const indexToX = (idx) => {
    const innerWidth = width - padding.left - padding.right;
    return padding.left + (idx / Math.max(1, candles.length - 1)) * innerWidth;
  };

  // Crosshair Mouse Handlers
  const handleMouseMove = (e) => {
    if (!containerRef.current || candles.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const innerWidth = width - padding.left - padding.right;
    const clampedX = Math.max(padding.left, Math.min(x, width - padding.right));
    const ratio = (clampedX - padding.left) / innerWidth;
    const idx = Math.round(ratio * (candles.length - 1));

    if (idx >= 0 && idx < candles.length) {
      setHoveredCandle(candles[idx]);
      setMousePos({ x: indexToX(idx), y, visible: true });
    }
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0, visible: false });
    setHoveredCandle(null);
  };

  const activeDisplayCandle = hoveredCandle || candles[candles.length - 1] || {};
  const isPositivePeriod = stock.change >= 0;

  return (
    <div className="graphify-container">
      {/* Chart Control Bar */}
      <div className="graphify-header">
        <div className="graphify-stats">
          <div className="stat-badge">
            <span className="label">O</span>
            <span className="value">{stock.currencySymbol}{activeDisplayCandle.open?.toFixed(2)}</span>
          </div>
          <div className="stat-badge">
            <span className="label">H</span>
            <span className="value text-emerald">{stock.currencySymbol}{activeDisplayCandle.high?.toFixed(2)}</span>
          </div>
          <div className="stat-badge">
            <span className="label">L</span>
            <span className="value text-crimson">{stock.currencySymbol}{activeDisplayCandle.low?.toFixed(2)}</span>
          </div>
          <div className="stat-badge">
            <span className="label">C</span>
            <span className="value">{stock.currencySymbol}{activeDisplayCandle.close?.toFixed(2)}</span>
          </div>
          {activeDisplayCandle.volume && (
            <div className="stat-badge d-none-sm">
              <span className="label">Vol</span>
              <span className="value">{(activeDisplayCandle.volume / 1000).toFixed(1)}k</span>
            </div>
          )}
          {activeDisplayCandle.label && (
            <div className="stat-badge text-muted">
              <span>{activeDisplayCandle.label}</span>
            </div>
          )}
        </div>

        {/* Indicators & Type Selectors */}
        <div className="graphify-actions">
          <div className="btn-group-toggle">
            <button
              className={`pill-btn ${chartType === "candlestick" ? "active" : ""}`}
              onClick={() => setChartType("candlestick")}
              title="Candlestick View"
            >
              Candles
            </button>
            <button
              className={`pill-btn ${chartType === "line" ? "active" : ""}`}
              onClick={() => setChartType("line")}
              title="Area Line View"
            >
              Line
            </button>
          </div>

          <div className="btn-group-toggle">
            <button
              className={`pill-btn indicator-btn ${showSMA ? "active-sma" : ""}`}
              onClick={() => setShowSMA(!showSMA)}
            >
              SMA 14
            </button>
            <button
              className={`pill-btn indicator-btn ${showEMA ? "active-ema" : ""}`}
              onClick={() => setShowEMA(!showEMA)}
            >
              EMA 20
            </button>
          </div>

          {/* Timeframes */}
          <div className="timeframe-selector">
            {["1D", "1W", "1M", "1Y", "ALL"].map((tf) => (
              <button
                key={tf}
                className={`tf-btn ${timeframe === tf ? "active" : ""}`}
                onClick={() => onTimeframeChange && onTimeframeChange(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Primary SVG Canvas */}
      <div
        className="graphify-svg-wrapper"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="graphify-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isPositivePeriod ? "#10B981" : "#EF4444"} stopOpacity="0.3" />
              <stop offset="100%" stopColor={isPositivePeriod ? "#10B981" : "#EF4444"} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Price Scale */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const priceVal = minPrice + (1 - pct) * (maxPrice - minPrice);
            const y = padding.top + pct * chartHeight;
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#1E293B"
                  strokeDasharray="4 4"
                />
                <text
                  x={width - padding.right + 8}
                  y={y + 4}
                  fill="#64748B"
                  fontSize="11"
                  fontFamily="monospace"
                >
                  {stock.currencySymbol}{priceVal.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Volume Histogram Bars */}
          {candles.map((c, idx) => {
            const x = indexToX(idx);
            const y = volumeToY(c.volume);
            const barHeight = height - padding.bottom - y;
            const barWidth = Math.max(2, (width / candles.length) * 0.6);
            return (
              <rect
                key={`vol-${idx}`}
                x={x - barWidth / 2}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={c.isBullish ? "rgba(16, 185, 129, 0.22)" : "rgba(239, 68, 68, 0.22)"}
                rx="1"
              />
            );
          })}

          {/* Area / Line Chart Mode */}
          {chartType === "line" && candles.length > 1 && (
            <>
              {/* Area Fill */}
              <polygon
                points={`
                  ${indexToX(0)},${height - padding.bottom}
                  ${candles.map((c, idx) => `${indexToX(idx)},${priceToY(c.close)}`).join(" ")}
                  ${indexToX(candles.length - 1)},${height - padding.bottom}
                `}
                fill="url(#areaGradient)"
              />
              {/* Stroke Line */}
              <polyline
                fill="none"
                stroke={isPositivePeriod ? "#10B981" : "#EF4444"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={candles.map((c, idx) => `${indexToX(idx)},${priceToY(c.close)}`).join(" ")}
              />
            </>
          )}

          {/* Candlestick Chart Mode */}
          {chartType === "candlestick" &&
            candles.map((c, idx) => {
              const x = indexToX(idx);
              const openY = priceToY(c.open);
              const closeY = priceToY(c.close);
              const highY = priceToY(c.high);
              const lowY = priceToY(c.low);
              const bodyTop = Math.min(openY, closeY);
              const bodyHeight = Math.max(2, Math.abs(openY - closeY));
              const candleWidth = Math.max(3, (width / candles.length) * 0.65);
              const color = c.isBullish ? "#10B981" : "#EF4444";

              return (
                <g key={`candle-${idx}`}>
                  {/* High - Low Wick */}
                  <line
                    x1={x}
                    y1={highY}
                    x2={x}
                    y2={lowY}
                    stroke={color}
                    strokeWidth="1.2"
                  />
                  {/* Real Body */}
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={c.isBullish ? color : color}
                    rx="1"
                  />
                </g>
              );
            })}

          {/* Moving Averages (SMA & EMA) */}
          {showSMA && smaData.length > 0 && (
            <polyline
              fill="none"
              stroke="#F59E0B"
              strokeWidth="1.8"
              strokeDasharray="2 2"
              points={smaData
                .map((val, idx) => (val !== null ? `${indexToX(idx)},${priceToY(val)}` : null))
                .filter(Boolean)
                .join(" ")}
            />
          )}

          {showEMA && emaData.length > 0 && (
            <polyline
              fill="none"
              stroke="#8B5CF6"
              strokeWidth="1.8"
              points={emaData
                .map((val, idx) => `${indexToX(idx)},${priceToY(val)}`)
                .join(" ")}
            />
          )}

          {/* Crosshair Inspection Lines */}
          {mousePos.visible && (
            <g className="crosshair-group">
              {/* Vertical Time Line */}
              <line
                x1={mousePos.x}
                y1={padding.top}
                x2={mousePos.x}
                y2={height - padding.bottom}
                stroke="#94A3B8"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {/* Horizontal Price Line */}
              <line
                x1={padding.left}
                y1={mousePos.y}
                x2={width - padding.right}
                y2={mousePos.y}
                stroke="#94A3B8"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            </g>
          )}

          {/* Time Labels on X-axis */}
          {candles
            .filter((_, idx) => idx % Math.ceil(candles.length / 6) === 0)
            .map((c, idx) => {
              const origIndex = candles.indexOf(c);
              return (
                <text
                  key={`lbl-${idx}`}
                  x={indexToX(origIndex)}
                  y={height - 8}
                  fill="#64748B"
                  fontSize="11"
                  textAnchor="middle"
                >
                  {c.label}
                </text>
              );
            })}
        </svg>
      </div>
    </div>
  );
};
