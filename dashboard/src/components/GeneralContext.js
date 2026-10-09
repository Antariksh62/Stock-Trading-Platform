import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import BuyActionWindow from "./BuyActionWindow";
import StockAnalyticsModal from "./StockAnalyticsModal";
import AIPortfolioAnalystModal from "./AIPortfolioAnalystModal";
import { socketService } from "../services/socketService";

const GeneralContext = React.createContext({
  openBuyWindow: (uid, mode, price) => {},
  closeBuyWindow: () => {},
  openAnalyticsWindow: (stockName, stockData) => {},
  closeAnalyticsWindow: () => {},
  openAIAnalystWindow: () => {},
  closeAIAnalystWindow: () => {},
  holdings: [],
  positions: [],
  orders: [],
  funds: {},
  refreshData: () => {},
});

export const GeneralContextProvider = (props) => {
  const [isBuyWindowOpen, setIsBuyWindowOpen] = useState(false);
  const [selectedStockUID, setSelectedStockUID] = useState("");
  const [selectedMode, setSelectedMode] = useState("BUY");
  const [selectedStockPrice, setSelectedStockPrice] = useState(null);

  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [analyticsStockName, setAnalyticsStockName] = useState("");
  const [analyticsStockData, setAnalyticsStockData] = useState(null);

  const [isAIAnalystOpen, setIsAIAnalystOpen] = useState(false);

  // Global Centralized Reactive State
  const [holdings, setHoldings] = useState([]);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [funds, setFunds] = useState({
    availableMargin: 100000.0,
    usedMargin: 0.0,
    availableCash: 100000.0,
    openingBalance: 100000.0,
    payin: 0.0,
  });

  const getActiveUserId = () => {
    try {
      const savedUser = localStorage.getItem("user");
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        return parsed.id || parsed._id || parsed.username || "demo_user";
      }
    } catch (e) {}
    return "demo_user";
  };

  const refreshData = useCallback(async () => {
    try {
      const [holdingsRes, positionsRes, ordersRes, fundsRes] = await Promise.all([
        axios.get("http://localhost:3001/allHoldings", { withCredentials: true }),
        axios.get("http://localhost:3001/allPositions", { withCredentials: true }),
        axios.get("http://localhost:3001/allOrders", { withCredentials: true }),
        axios.get("http://localhost:3001/api/funds", { withCredentials: true }),
      ]);

      if (holdingsRes.data) setHoldings(holdingsRes.data);
      if (positionsRes.data) setPositions(positionsRes.data);
      if (ordersRes.data) setOrders(ordersRes.data);
      if (fundsRes.data) {
        setFunds(fundsRes.data);
        localStorage.setItem("user_funds", JSON.stringify(fundsRes.data));
      }
    } catch (err) {
      console.warn("Initial REST fetch error (using fallback):", err.message);
    }
  }, []);

  // Initialize Socket.IO connection and subscriptions
  useEffect(() => {
    const userId = getActiveUserId();
    socketService.connect(userId);

    // Initial load
    refreshData();

    // Subscribe to real-time events emitted by the backend execution engine
    const unsubHoldings = socketService.subscribe("holdings_update", (updatedHoldings) => {
      console.log("[WebSocket] Received real-time holdings update:", updatedHoldings?.length);
      if (updatedHoldings) setHoldings(updatedHoldings);
    });

    const unsubPositions = socketService.subscribe("positions_update", (updatedPositions) => {
      console.log("[WebSocket] Received real-time positions update:", updatedPositions?.length);
      if (updatedPositions) setPositions(updatedPositions);
    });

    const unsubOrders = socketService.subscribe("orders_update", (updatedOrders) => {
      console.log("[WebSocket] Received real-time orders update:", updatedOrders?.length);
      if (updatedOrders) setOrders(updatedOrders);
    });

    const unsubFunds = socketService.subscribe("funds_update", (updatedFunds) => {
      console.log("[WebSocket] Received real-time funds update:", updatedFunds);
      if (updatedFunds) {
        setFunds(updatedFunds);
        localStorage.setItem("user_funds", JSON.stringify(updatedFunds));
      }
    });

    return () => {
      unsubHoldings();
      unsubPositions();
      unsubOrders();
      unsubFunds();
    };
  }, [refreshData]);

  const handleOpenBuyWindow = (uid, mode = "BUY", price = null) => {
    setIsBuyWindowOpen(true);
    setSelectedStockUID(uid);
    setSelectedMode(mode);
    setSelectedStockPrice(price);
  };

  const handleCloseBuyWindow = () => {
    setIsBuyWindowOpen(false);
    setSelectedStockUID("");
    setSelectedMode("BUY");
    setSelectedStockPrice(null);
  };

  const handleOpenAnalyticsWindow = (stockName, stockData = null) => {
    setAnalyticsStockName(stockName);
    setAnalyticsStockData(stockData);
    setIsAnalyticsOpen(true);
  };

  const handleCloseAnalyticsWindow = () => {
    setIsAnalyticsOpen(false);
    setAnalyticsStockName("");
    setAnalyticsStockData(null);
  };

  const handleOpenAIAnalyst = () => {
    setIsAIAnalystOpen(true);
  };

  const handleCloseAIAnalyst = () => {
    setIsAIAnalystOpen(false);
  };

  return (
    <GeneralContext.Provider
      value={{
        openBuyWindow: handleOpenBuyWindow,
        closeBuyWindow: handleCloseBuyWindow,
        openAnalyticsWindow: handleOpenAnalyticsWindow,
        closeAnalyticsWindow: handleCloseAnalyticsWindow,
        openAIAnalystWindow: handleOpenAIAnalyst,
        closeAIAnalystWindow: handleCloseAIAnalyst,
        holdings,
        positions,
        orders,
        funds,
        refreshData,
      }}
    >
      {props.children}
      {isBuyWindowOpen && (
        <BuyActionWindow
          uid={selectedStockUID}
          mode={selectedMode}
          customPrice={selectedStockPrice}
        />
      )}
      {isAnalyticsOpen && (
        <StockAnalyticsModal
          stockName={analyticsStockName}
          stockData={analyticsStockData}
          onClose={handleCloseAnalyticsWindow}
          onOpenBuyWindow={handleOpenBuyWindow}
        />
      )}
      {isAIAnalystOpen && <AIPortfolioAnalystModal onClose={handleCloseAIAnalyst} />}
    </GeneralContext.Provider>
  );
};

export default GeneralContext;
