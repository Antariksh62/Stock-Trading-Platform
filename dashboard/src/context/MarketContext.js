import React, { createContext, useState, useEffect, useCallback, useMemo } from "react";
import { defaultEquities, defaultIndices } from "../data/defaultEquities";
import { twelveDataService } from "../services/twelveDataService";

export const MarketContext = createContext();

export const MarketContextProvider = ({ children }) => {
  const [stocks, setStocks] = useState(defaultEquities);
  const [indices] = useState(defaultIndices);
  const [selectedStock, setSelectedStock] = useState(defaultEquities[0]);
  const [timeframe, setTimeframe] = useState("1D");
  const [isMockMode, setIsMockMode] = useState(true);
  const [apiKey, setApiKey] = useState(twelveDataService.getApiKey());
  const [quotaInfo, setQuotaInfo] = useState(twelveDataService.getQuotaInfo());
  const [searchQuery, setSearchQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState("ALL"); // ALL, NASDAQ, NSE
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  // Paper Trading Portfolio State
  const [portfolio, setPortfolio] = useState(() => {
    const saved = localStorage.getItem("paper_portfolio");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    return {
      cashUSD: 100000,
      cashINR: 8000000,
      holdings: [
        { symbol: "AAPL", name: "Apple Inc.", qty: 50, avgPrice: 215.00, currency: "USD", market: "NASDAQ" },
        { symbol: "NVDA", name: "NVIDIA Corporation", qty: 75, avgPrice: 120.50, currency: "USD", market: "NASDAQ" },
        { symbol: "RELIANCE", name: "Reliance Industries Ltd.", qty: 40, avgPrice: 2850.00, currency: "INR", market: "NSE" },
        { symbol: "TCS", name: "Tata Consultancy Services", qty: 25, avgPrice: 4180.00, currency: "INR", market: "NSE" },
      ],
      orders: [],
    };
  });

  // Save portfolio changes to localStorage
  useEffect(() => {
    localStorage.setItem("paper_portfolio", JSON.stringify(portfolio));
  }, [portfolio]);

  const refreshQuota = useCallback(() => {
    setQuotaInfo(twelveDataService.getQuotaInfo());
  }, []);

  const handleUpdateApiKey = (newKey) => {
    twelveDataService.setApiKey(newKey);
    setApiKey(newKey);
    refreshQuota();
    if (newKey) {
      setIsMockMode(false);
    }
  };

  const toggleMockMode = () => {
    setIsMockMode((prev) => !prev);
  };

  // Paper Trade Execution Handler (Buy/Sell)
  const executePaperTrade = useCallback(({ symbol, qty, price, type, orderType = "MARKET" }) => {
    const stock = stocks.find((s) => s.symbol === symbol);
    if (!stock || qty <= 0) return { success: false, message: "Invalid stock or quantity" };

    const totalCost = qty * price;
    const isUSD = stock.currency === "USD";
    const cashKey = isUSD ? "cashUSD" : "cashINR";

    if (type === "BUY") {
      if (portfolio[cashKey] < totalCost) {
        return { success: false, message: `Insufficient cash balance in ${stock.currency}` };
      }

      setPortfolio((prev) => {
        const existingIndex = prev.holdings.findIndex((h) => h.symbol === symbol);
        let updatedHoldings = [...prev.holdings];

        if (existingIndex >= 0) {
          const existing = updatedHoldings[existingIndex];
          const newQty = existing.qty + qty;
          const newAvgPrice = (existing.qty * existing.avgPrice + totalCost) / newQty;
          updatedHoldings[existingIndex] = { ...existing, qty: newQty, avgPrice: Number(newAvgPrice.toFixed(2)) };
        } else {
          updatedHoldings.push({
            symbol: stock.symbol,
            name: stock.name,
            qty,
            avgPrice: price,
            currency: stock.currency,
            market: stock.market,
          });
        }

        const newOrder = {
          id: Date.now().toString(),
          timestamp: new Date().toLocaleTimeString(),
          symbol,
          type: "BUY",
          orderType,
          qty,
          price,
          total: totalCost,
          currency: stock.currency,
        };

        return {
          ...prev,
          [cashKey]: Number((prev[cashKey] - totalCost).toFixed(2)),
          holdings: updatedHoldings,
          orders: [newOrder, ...prev.orders],
        };
      });

      return { success: true, message: `Successfully bought ${qty} shares of ${symbol}` };
    } else if (type === "SELL") {
      const existingHolding = portfolio.holdings.find((h) => h.symbol === symbol);
      if (!existingHolding || existingHolding.qty < qty) {
        return { success: false, message: `Insufficient shares of ${symbol} to sell` };
      }

      setPortfolio((prev) => {
        let updatedHoldings = prev.holdings
          .map((h) => {
            if (h.symbol === symbol) {
              return { ...h, qty: h.qty - qty };
            }
            return h;
          })
          .filter((h) => h.qty > 0);

        const newOrder = {
          id: Date.now().toString(),
          timestamp: new Date().toLocaleTimeString(),
          symbol,
          type: "SELL",
          orderType,
          qty,
          price,
          total: totalCost,
          currency: stock.currency,
        };

        return {
          ...prev,
          [cashKey]: Number((prev[cashKey] + totalCost).toFixed(2)),
          holdings: updatedHoldings,
          orders: [newOrder, ...prev.orders],
        };
      });

      return { success: true, message: `Successfully sold ${qty} shares of ${symbol}` };
    }
  }, [stocks, portfolio]);

  // Reset Paper Trading Account
  const resetPaperAccount = () => {
    setPortfolio({
      cashUSD: 100000,
      cashINR: 8000000,
      holdings: [],
      orders: [],
    });
  };

  // Calculate live portfolio values and P&L
  const portfolioSummary = useMemo(() => {
    let totalInvestedUSD = 0;
    let currentValUSD = 0;
    let totalInvestedINR = 0;
    let currentValINR = 0;

    portfolio.holdings.forEach((h) => {
      const liveStock = stocks.find((s) => s.symbol === h.symbol);
      const curPrice = liveStock ? liveStock.price : h.avgPrice;
      const invested = h.qty * h.avgPrice;
      const current = h.qty * curPrice;

      if (h.currency === "USD") {
        totalInvestedUSD += invested;
        currentValUSD += current;
      } else {
        totalInvestedINR += invested;
        currentValINR += current;
      }
    });

    const pnlUSD = currentValUSD - totalInvestedUSD;
    const pnlUSDPercent = totalInvestedUSD > 0 ? (pnlUSD / totalInvestedUSD) * 100 : 0;

    const pnlINR = currentValINR - totalInvestedINR;
    const pnlINRPercent = totalInvestedINR > 0 ? (pnlINR / totalInvestedINR) * 100 : 0;

    return {
      totalInvestedUSD,
      currentValUSD,
      pnlUSD,
      pnlUSDPercent,
      totalInvestedINR,
      currentValINR,
      pnlINR,
      pnlINRPercent,
    };
  }, [portfolio.holdings, stocks]);

  // Update selected stock whenever stock state updates
  useEffect(() => {
    const updatedSelected = stocks.find((s) => s.symbol === selectedStock?.symbol);
    if (updatedSelected) {
      setSelectedStock(updatedSelected);
    }
  }, [stocks, selectedStock?.symbol]);

  const value = {
    stocks,
    setStocks,
    indices,
    selectedStock,
    setSelectedStock,
    timeframe,
    setTimeframe,
    isMockMode,
    toggleMockMode,
    apiKey,
    updateApiKey: handleUpdateApiKey,
    quotaInfo,
    refreshQuota,
    searchQuery,
    setSearchQuery,
    marketFilter,
    setMarketFilter,
    portfolio,
    portfolioSummary,
    executePaperTrade,
    resetPaperAccount,
    isApiKeyModalOpen,
    setIsApiKeyModalOpen,
  };

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
};
