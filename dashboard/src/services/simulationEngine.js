/**
 * Stochastic Simulation Engine for Stock Market Price Action
 * Implements Geometric Brownian Motion for realistic price ticks and candlestick generation.
 */

// Generate realistic historical candlestick series for a given base price and timeframe
export const generateHistoricalCandles = (basePrice, timeframe = "1D", count = 60) => {
  const candles = [];
  let currentPrice = basePrice * (timeframe === "1D" ? 0.985 : timeframe === "1W" ? 0.95 : 0.88);
  const now = new Date();
  
  let stepMinutes = 5;
  if (timeframe === "1D") stepMinutes = 5;
  else if (timeframe === "1W") stepMinutes = 30;
  else if (timeframe === "1M") stepMinutes = 240;
  else if (timeframe === "1Y") stepMinutes = 1440;
  else stepMinutes = 4320;

  for (let i = count; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * stepMinutes * 60 * 1000);
    const volatility = basePrice * 0.004;
    const randomWalk = (Math.random() - 0.49) * volatility * 2;
    
    const open = currentPrice;
    const close = Math.max(1, open + randomWalk);
    const high = Math.max(open, close) + Math.random() * volatility * 1.2;
    const low = Math.min(open, close) - Math.random() * volatility * 1.2;
    const volume = Math.floor(Math.random() * 50000 + 10000);

    candles.push({
      time: timestamp.toISOString(),
      label: formatCandleTime(timestamp, timeframe),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
      isBullish: close >= open,
    });

    currentPrice = close;
  }

  // Ensure last candle matches basePrice closely
  if (candles.length > 0) {
    candles[candles.length - 1].close = basePrice;
    candles[candles.length - 1].high = Math.max(candles[candles.length - 1].high, basePrice);
    candles[candles.length - 1].low = Math.min(candles[candles.length - 1].low, basePrice);
  }

  return candles;
};

const formatCandleTime = (date, timeframe) => {
  if (timeframe === "1D") {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (timeframe === "1W" || timeframe === "1M") {
    return `${date.getDate()} ${date.toLocaleString('default', { month: 'short' })}`;
  }
  return `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear().toString().slice(2)}`;
};

// Simulate live price tick update with realistic drift
export const simulateLivePriceTick = (stock) => {
  const volatility = stock.price * 0.0015;
  const delta = (Math.random() - 0.495) * volatility;
  const newPrice = Number(Math.max(1, stock.price + delta).toFixed(2));
  const newChange = Number((newPrice - stock.previousClose).toFixed(2));
  const newChangePercent = Number(((newChange / stock.previousClose) * 100).toFixed(2));

  const updatedSparkline = [...(stock.sparkline || []).slice(1), newPrice];

  return {
    ...stock,
    price: newPrice,
    change: newChange,
    changePercent: newChangePercent,
    high: Math.max(stock.high, newPrice),
    low: Math.min(stock.low, newPrice),
    sparkline: updatedSparkline,
    lastTickTime: Date.now(),
    tickDirection: delta >= 0 ? "up" : "down",
  };
};

// Generate realistic Level 2 Order Book Depth
export const generateOrderBook = (currentPrice) => {
  const bids = [];
  const asks = [];

  for (let i = 1; i <= 5; i++) {
    const bidPrice = Number((currentPrice - i * (currentPrice * 0.0006)).toFixed(2));
    const bidQty = Math.floor(Math.random() * 400 + 50) * (6 - i);
    const bidOrders = Math.floor(Math.random() * 12 + 2);
    bids.push({ price: bidPrice, quantity: bidQty, orders: bidOrders });

    const askPrice = Number((currentPrice + i * (currentPrice * 0.0006)).toFixed(2));
    const askQty = Math.floor(Math.random() * 400 + 50) * (6 - i);
    const askOrders = Math.floor(Math.random() * 12 + 2);
    asks.push({ price: askPrice, quantity: askQty, orders: askOrders });
  }

  const totalBidQty = bids.reduce((acc, curr) => acc + curr.quantity, 0);
  const totalAskQty = asks.reduce((acc, curr) => acc + curr.quantity, 0);

  return {
    bids,
    asks,
    totalBidQty,
    totalAskQty,
    bidRatio: Number(((totalBidQty / (totalBidQty + totalAskQty)) * 100).toFixed(1)),
    askRatio: Number(((totalAskQty / (totalBidQty + totalAskQty)) * 100).toFixed(1)),
  };
};
