import React, { useState, useContext, useEffect, useId } from "react";
import axios from "axios";
import GeneralContext from "./GeneralContext";
import { watchList } from "../data/data";
import "./BuyActionWindow.css";

const BuyActionWindow = ({ uid, mode = "BUY", customPrice = null, initialProduct = null, initialQty = 1 }) => {
  const matchingStock = watchList.find((s) => s.name === uid);
  const basePrice = customPrice || (matchingStock ? matchingStock.price : 100.0);

  const { closeBuyWindow, refreshData, holdings = [], positions = [] } = useContext(GeneralContext);

  // Intelligently auto-detect product and quantity when selling
  const matchingPosition = (positions || []).find((p) => p.name === uid);
  const matchingHolding = (holdings || []).find((h) => h.name === uid);

  const defaultProduct = initialProduct || (
    mode === "SELL" && matchingPosition && !matchingHolding ? "MIS" : "CNC"
  );

  const defaultQty = initialQty > 1 ? initialQty : (
    mode === "SELL" && matchingPosition && !matchingHolding ? Math.max(1, matchingPosition.qty) : (
      mode === "SELL" && matchingHolding ? Math.max(1, matchingHolding.qty) : 1
    )
  );

  const [stockQuantity, setStockQuantity] = useState(defaultQty);
  const [stockPrice, setStockPrice] = useState(basePrice);
  const [orderType, setOrderType] = useState("MARKET"); // "MARKET" | "LIMIT"
  const [product, setProduct] = useState(defaultProduct); // "CNC" | "MIS"
  const [limitPrice, setLimitPrice] = useState(basePrice);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: string }
  const baseId = useId();

  const getActiveUser = () => {
    try {
      const savedUser = localStorage.getItem("user");
      if (savedUser) {
        return JSON.parse(savedUser);
      }
    } catch (e) {}
    return null;
  };
  const activeUser = getActiveUser();
  const userId = activeUser?.id || activeUser?._id || activeUser?.username || "demo_user";
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (customPrice) {
      setStockPrice(customPrice);
      setLimitPrice(customPrice);
    } else if (matchingStock) {
      setStockPrice(matchingStock.price);
      setLimitPrice(matchingStock.price);
    }
  }, [uid, matchingStock, customPrice]);

  const isSell = mode === "SELL";
  const executionPrice = orderType === "LIMIT" ? Number(limitPrice) : Number(stockPrice);
  const marginRequired = Number(stockQuantity) * (executionPrice || 1);

  const handleOrderSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setFeedback(null);

    const idempotencyKey = `order_${baseId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const response = await axios.post(
        "http://localhost:3001/newOrder",
        {
          userId,
          name: uid,
          qty: parseInt(stockQuantity, 10),
          price: executionPrice,
          mode: mode || "BUY",
          product,
          orderType,
          limitPrice: orderType === "LIMIT" ? Number(limitPrice) : null,
          idempotencyKey,
        },
        { headers, withCredentials: true }
      );

      if (response.data && response.data.success) {
        setFeedback({
          type: "success",
          message: response.data.message || `Order placed successfully!`,
        });
        if (typeof refreshData === "function") {
          refreshData();
        }
        setTimeout(() => {
          closeBuyWindow();
        }, 1000);
      } else {
        setFeedback({
          type: "error",
          message: response.data?.message || "Order rejected by exchange validation",
        });
      }
    } catch (error) {
      const errMessage =
        error.response?.data?.message ||
        error.response?.data?.rejectionReason ||
        "Failed to place order. If your wallet balance is ₹0, please visit the Funds tab to deposit money via UPI.";
      setFeedback({
        type: "error",
        message: errMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" id="buy-window" draggable="true" style={{ width: "420px", zIndex: 1300 }}>
      {/* Header */}
      <div className={`header ${isSell ? "header-sell" : ""}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0 }}>
            {isSell ? "Sell" : "Buy"} {uid}
          </h3>
          <span style={{ fontSize: "0.72rem", opacity: 0.85 }}>
            {product === "CNC" ? "Delivery (CNC)" : "Intraday (MIS)"} • {orderType} Order
          </span>
        </div>
        <button
          onClick={closeBuyWindow}
          style={{ background: "transparent", border: "none", color: "#fff", fontSize: "1.2rem", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {/* Product & Order Type Selector Bars */}
      <div style={{ padding: "12px 18px 0 18px", display: "flex", justifyContent: "space-between", gap: "10px" }}>
        {/* Product Type */}
        <div style={{ display: "flex", background: "#f1f3f5", borderRadius: "3px", padding: "2px" }}>
          <button
            type="button"
            onClick={() => setProduct("CNC")}
            style={{
              padding: "4px 10px",
              fontSize: "0.75rem",
              border: "none",
              borderRadius: "2px",
              background: product === "CNC" ? "#fff" : "transparent",
              fontWeight: product === "CNC" ? "600" : "400",
              color: product === "CNC" ? "#387ed1" : "#666",
              cursor: "pointer",
              boxShadow: product === "CNC" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
            }}
          >
            CNC (Long term)
          </button>
          <button
            type="button"
            onClick={() => setProduct("MIS")}
            style={{
              padding: "4px 10px",
              fontSize: "0.75rem",
              border: "none",
              borderRadius: "2px",
              background: product === "MIS" ? "#fff" : "transparent",
              fontWeight: product === "MIS" ? "600" : "400",
              color: product === "MIS" ? "#387ed1" : "#666",
              cursor: "pointer",
              boxShadow: product === "MIS" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
            }}
          >
            MIS (Intraday)
          </button>
        </div>

        {/* Order Type */}
        <div style={{ display: "flex", background: "#f1f3f5", borderRadius: "3px", padding: "2px" }}>
          <button
            type="button"
            onClick={() => setOrderType("MARKET")}
            style={{
              padding: "4px 10px",
              fontSize: "0.75rem",
              border: "none",
              borderRadius: "2px",
              background: orderType === "MARKET" ? "#fff" : "transparent",
              fontWeight: orderType === "MARKET" ? "600" : "400",
              color: orderType === "MARKET" ? "#387ed1" : "#666",
              cursor: "pointer",
              boxShadow: orderType === "MARKET" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
            }}
          >
            Market
          </button>
          <button
            type="button"
            onClick={() => setOrderType("LIMIT")}
            style={{
              padding: "4px 10px",
              fontSize: "0.75rem",
              border: "none",
              borderRadius: "2px",
              background: orderType === "LIMIT" ? "#fff" : "transparent",
              fontWeight: orderType === "LIMIT" ? "600" : "400",
              color: orderType === "LIMIT" ? "#387ed1" : "#666",
              cursor: "pointer",
              boxShadow: orderType === "LIMIT" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
            }}
          >
            Limit
          </button>
        </div>
      </div>

      {/* Input Fields */}
      <div className="regular-order" style={{ padding: "12px 18px" }}>
        <div className="inputs" style={{ display: "flex", gap: "12px" }}>
          <fieldset style={{ flex: 1 }}>
            <legend>Qty.</legend>
            <input
              type="number"
              name="qty"
              id="qty"
              min="1"
              step="1"
              onChange={(e) => setStockQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              value={stockQuantity}
            />
          </fieldset>

          <fieldset style={{ flex: 1 }}>
            <legend>{orderType === "LIMIT" ? "Limit Price" : "Market Price"}</legend>
            <input
              type="number"
              name="price"
              id="price"
              step="0.05"
              disabled={orderType === "MARKET"}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setStockPrice(val);
                setLimitPrice(val);
              }}
              value={orderType === "LIMIT" ? limitPrice : stockPrice}
              style={{ background: orderType === "MARKET" ? "#f9f9f9" : "#fff" }}
            />
          </fieldset>
        </div>
      </div>

      {/* Live Feedback Banner */}
      {feedback && (
        <div
          style={{
            margin: "0 18px 12px 18px",
            padding: "8px 12px",
            borderRadius: "3px",
            fontSize: "0.78rem",
            background: feedback.type === "success" ? "#e8f5e9" : "#ffebee",
            color: feedback.type === "success" ? "#2e7d32" : "#c62828",
            border: feedback.type === "success" ? "1px solid #c8e6c9" : "1px solid #ffcdd2",
            lineHeight: "1.4",
          }}
        >
          {feedback.message}
        </div>
      )}

      {/* Action Footer */}
      <div className="buttons" style={{ padding: "12px 18px", borderTop: "1px solid #f0f0f0" }}>
        <span style={{ fontSize: "0.82rem", color: "#666" }}>
          Margin required: <strong style={{ color: "#333" }}>₹{marginRequired.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </span>
        <div>
          <button
            type="button"
            disabled={loading}
            className={`btn ${isSell ? "btn-orange" : "btn-blue"}`}
            onClick={handleOrderSubmit}
            style={{ border: "none", cursor: loading ? "not-allowed" : "pointer", padding: "8px 18px", fontWeight: "500" }}
          >
            {loading ? "Placing..." : isSell ? "Sell" : "Buy"}
          </button>
          <button
            type="button"
            className="btn btn-grey"
            onClick={closeBuyWindow}
            style={{ border: "none", cursor: "pointer", padding: "8px 14px" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default BuyActionWindow;