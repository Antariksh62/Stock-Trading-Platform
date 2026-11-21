import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API_BASE } from "../config";
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
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedQty, setSelectedQty] = useState(1);

  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [analyticsStockName, setAnalyticsStockName] = useState("");
  const [analyticsStockData, setAnalyticsStockData] = useState(null);

  const [isAIAnalystOpen, setIsAIAnalystOpen] = useState(false);

  // Global Centralized Reactive State
  const [holdings, setHoldings] = useState([]);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [funds, setFunds] = useState({
    availableMargin: 0.0,
    usedMargin: 0.0,
    availableCash: 0.0,
    openingBalance: 0.0,
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

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("token");
    const userId = getActiveUserId();
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return { headers, params: { userId }, withCredentials: true };
  }, []);

  const refreshData = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      // In Guest Paper Trading mode, avoid sending unauthenticated requests that 401.
      try {
        const savedFunds = localStorage.getItem("user_funds");
        if (savedFunds) {
          setFunds(JSON.parse(savedFunds));
        }
      } catch (e) {}
      return;
    }

    try {
      const config = getAuthHeaders();
      const [holdingsRes, positionsRes, ordersRes, fundsRes] = await Promise.all([
        axios.get(`${API_BASE}/allHoldings`, config),
        axios.get(`${API_BASE}/allPositions`, config),
        axios.get(`${API_BASE}/allOrders`, config),
        axios.get(`${API_BASE}/api/funds`, config),
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
  }, [getAuthHeaders]);

  // Initialize Socket.IO connection and subscriptions
  useEffect(() => {
    const userId = getActiveUserId();
    const token = localStorage.getItem("token");

    let unsubHoldings = () => {};
    let unsubPositions = () => {};
    let unsubOrders = () => {};
    let unsubFunds = () => {};

    // Only establish authenticated WebSocket connection when user has an active session
    if (token) {
      socketService.connect(userId, token);

      unsubHoldings = socketService.subscribe("holdings_update", (updatedHoldings) => {
        if (updatedHoldings) setHoldings(updatedHoldings);
      });

      unsubPositions = socketService.subscribe("positions_update", (updatedPositions) => {
        if (updatedPositions) setPositions(updatedPositions);
      });

      unsubOrders = socketService.subscribe("orders_update", (updatedOrders) => {
        if (updatedOrders) setOrders(updatedOrders);
      });

      unsubFunds = socketService.subscribe("funds_update", (updatedFunds) => {
        if (updatedFunds) {
          setFunds(updatedFunds);
          localStorage.setItem("user_funds", JSON.stringify(updatedFunds));
        }
      });
    }

    // Initial load
    refreshData();

    return () => {
      unsubHoldings();
      unsubPositions();
      unsubOrders();
      unsubFunds();
    };
  }, [refreshData]);

  const handleOpenBuyWindow = (uid, mode = "BUY", price = null, product = null, qty = 1) => {
    setIsBuyWindowOpen(true);
    setSelectedStockUID(uid);
    setSelectedMode(mode);
    setSelectedStockPrice(price);
    setSelectedProduct(product);
    setSelectedQty(qty || 1);
  };

  const handleCloseBuyWindow = () => {
    setIsBuyWindowOpen(false);
    setSelectedStockUID("");
    setSelectedMode("BUY");
    setSelectedStockPrice(null);
    setSelectedProduct(null);
    setSelectedQty(1);
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
          initialProduct={selectedProduct}
          initialQty={selectedQty}
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
