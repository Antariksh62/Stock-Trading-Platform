import React, { useState, useEffect, useCallback } from "react";
import Menu from "./Menu";
import axios from "axios";
import { socketService } from "../services/socketService";

/**
 * Dynamically computes open/closed state for Indian & US exchanges
 * based on real-time clock and target exchange timezones.
 */
export const computeExchangeStatuses = () => {
  const now = new Date();

  // 1. Indian Stock Exchange (NSE / BSE) - Timezone: Asia/Kolkata (IST)
  const istFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const istParts = istFormatter.formatToParts(now);
  const istDay = istParts.find((p) => p.type === "weekday")?.value;
  const istHour = parseInt(istParts.find((p) => p.type === "hour")?.value || "0", 10);
  const istMinute = parseInt(istParts.find((p) => p.type === "minute")?.value || "0", 10);
  const istTotalMins = istHour * 60 + istMinute;

  const isIstWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(istDay);
  const isIndianMarketOpen = isIstWeekday && istTotalMins >= 9 * 60 + 15 && istTotalMins <= 15 * 60 + 30;

  // 2. US Stock Exchange (NASDAQ / NYSE) - Timezone: America/New_York (EST/EDT)
  const nyFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const nyParts = nyFormatter.formatToParts(now);
  const nyDay = nyParts.find((p) => p.type === "weekday")?.value;
  const nyHour = parseInt(nyParts.find((p) => p.type === "hour")?.value || "0", 10);
  const nyMinute = parseInt(nyParts.find((p) => p.type === "minute")?.value || "0", 10);
  const nyTotalMins = nyHour * 60 + nyMinute;

  const isNyWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(nyDay);
  const isUsMarketOpen = isNyWeekday && nyTotalMins >= 9 * 60 + 30 && nyTotalMins <= 16 * 60;

  return {
    indian: {
      isOpen: isIndianMarketOpen,
      label: isIndianMarketOpen ? "NSE OPEN" : "NSE CLOSED",
      hours: "09:15 – 15:30 IST (Mon-Fri)",
      timeStr: `${String(istHour).padStart(2, "0")}:${String(istMinute).padStart(2, "0")} IST`,
    },
    us: {
      isOpen: isUsMarketOpen,
      label: isUsMarketOpen ? "NASDAQ OPEN" : "NASDAQ CLOSED",
      hours: "09:30 – 16:00 EDT (Mon-Fri)",
      timeStr: `${String(nyHour).padStart(2, "0")}:${String(nyMinute).padStart(2, "0")} EDT`,
    },
  };
};

const TopBar = () => {
  const [indicesData, setIndicesData] = useState({
    nifty: { name: "NIFTY 50", symbol: "^NSEI", points: 22520.45, percent: "+1.30%", isDown: false },
    sensex: { name: "SENSEX", symbol: "^BSESN", points: 72472.33, percent: "+1.23%", isDown: false },
    nasdaq: { name: "NASDAQ (QQQ)", symbol: "QQQ", points: 488.50, percent: "+0.51%", isDown: false },
  });

  const [connectionStatus, setConnectionStatus] = useState("connecting"); // 'connected' | 'offline' | 'connecting'
  const [exchangeStatuses, setExchangeStatuses] = useState(computeExchangeStatuses);
  const [sourceTag, setSourceTag] = useState("cache");

  // Re-calculate market open/close dynamically every 15 seconds
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setExchangeStatuses(computeExchangeStatuses());
    }, 15000);
    return () => clearInterval(clockInterval);
  }, []);

  // Update ticker state from incoming data payload
  const handleTickerPayload = useCallback((payload) => {
    if (payload && payload.indices) {
      setIndicesData((prev) => ({
        ...prev,
        ...payload.indices,
      }));
      if (payload.source) setSourceTag(payload.source);
      setConnectionStatus("connected");
    }
  }, []);

  // Initial REST fetch + Socket.IO real-time subscription
  useEffect(() => {
    let isMounted = true;

    // 1. Initial HTTP fetch for instantaneous render
    axios
      .get("http://localhost:3001/api/ticker", { timeout: 6000 })
      .then((res) => {
        if (isMounted && res.data) {
          handleTickerPayload(res.data);
        }
      })
      .catch((err) => {
        console.warn("[Ticker] Initial HTTP fetch fallback:", err.message);
      });

    // 2. Connect & Subscribe to Socket.IO ticker stream
    const socket = socketService.connect();

    if (socket) {
      if (socket.connected) setConnectionStatus("connected");

      const onConnect = () => setConnectionStatus("connected");
      const onDisconnect = () => setConnectionStatus("offline");

      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);

      const unsubscribeTicker = socketService.subscribe("ticker_update", (data) => {
        if (isMounted) handleTickerPayload(data);
      });

      return () => {
        isMounted = false;
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        unsubscribeTicker();
      };
    }
  }, [handleTickerPayload]);

  return (
    <div className="topbar-container">
      <div className="indices-container" style={{ flexBasis: "48%", justifyContent: "flex-start", gap: "16px", alignItems: "center" }}>
        
        {/* Dynamic Indian Exchange Status Badge (IST) */}
        <div
          title={`NSE/BSE Trading Hours: ${exchangeStatuses.indian.hours} • Current: ${exchangeStatuses.indian.timeStr}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "2px 7px",
            borderRadius: "10px",
            fontSize: "0.65rem",
            fontWeight: "600",
            background: exchangeStatuses.indian.isOpen ? "#e8f5e9" : "#fff3e0",
            color: exchangeStatuses.indian.isOpen ? "#2e7d32" : "#e65100",
            border: exchangeStatuses.indian.isOpen ? "1px solid #c8e6c9" : "1px solid #ffe0b2",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: "0.5rem" }}>{exchangeStatuses.indian.isOpen ? "●" : "■"}</span>
          <span>{exchangeStatuses.indian.label}</span>
        </div>

        {/* NIFTY 50 */}
        <div className="nifty" title={`National Stock Exchange • ${exchangeStatuses.indian.isOpen ? "Live Feed" : "Official Close"}`}>
          <p className="index">{indicesData.nifty.name}</p>
          <p
            className="index-points"
            style={{
              color: indicesData.nifty.isDown ? "#df4949" : "#4caf50",
              transition: "color 0.2s ease",
            }}
          >
            {typeof indicesData.nifty.points === "number"
              ? indicesData.nifty.points.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : indicesData.nifty.points}
          </p>
          <p className="percent" style={{ color: indicesData.nifty.isDown ? "#df4949" : "#4caf50" }}>
            {indicesData.nifty.percent}
          </p>
        </div>

        {/* SENSEX */}
        <div className="sensex" title={`Bombay Stock Exchange • ${exchangeStatuses.indian.isOpen ? "Live Feed" : "Official Close"}`}>
          <p className="index">{indicesData.sensex.name}</p>
          <p
            className="index-points"
            style={{
              color: indicesData.sensex.isDown ? "#df4949" : "#4caf50",
              transition: "color 0.2s ease",
            }}
          >
            {typeof indicesData.sensex.points === "number"
              ? indicesData.sensex.points.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : indicesData.sensex.points}
          </p>
          <p className="percent" style={{ color: indicesData.sensex.isDown ? "#df4949" : "#4caf50" }}>
            {indicesData.sensex.percent}
          </p>
        </div>

        {/* NASDAQ (QQQ) with Dynamic US Market Status Badge */}
        <div className="sensex" title={`NASDAQ / US Tech Benchmark • Hours: ${exchangeStatuses.us.hours} • Current: ${exchangeStatuses.us.timeStr}`}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <p className="index" style={{ margin: 0 }}>{indicesData.nasdaq.name}</p>
            <span
              style={{
                fontSize: "0.58rem",
                padding: "1px 4px",
                borderRadius: "3px",
                background: exchangeStatuses.us.isOpen ? "#e8f5e9" : "#f5f5f5",
                color: exchangeStatuses.us.isOpen ? "#2e7d32" : "#757575",
                fontWeight: "600",
              }}
            >
              {exchangeStatuses.us.isOpen ? "OPEN" : "CLOSED"}
            </span>
          </div>
          <p
            className="index-points"
            style={{
              color: indicesData.nasdaq.isDown ? "#df4949" : "#4caf50",
              transition: "color 0.2s ease",
            }}
          >
            ${typeof indicesData.nasdaq.points === "number"
              ? indicesData.nasdaq.points.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : indicesData.nasdaq.points}
          </p>
          <p className="percent" style={{ color: indicesData.nasdaq.isDown ? "#df4949" : "#4caf50" }}>
            {indicesData.nasdaq.percent}
          </p>
        </div>

        {/* Stream Health Indicator */}
        <div
          title={`Real-Time Ticker Stream: ${connectionStatus} (Source: ${sourceTag})`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "0.62rem",
            color: connectionStatus === "connected" ? "#4caf50" : "#9e9e9e",
          }}
        >
          <span style={{ fontSize: "0.45rem" }}>●</span>
          <span>{connectionStatus === "connected" ? "LIVE" : "SYNC"}</span>
        </div>

      </div>

      <Menu />
    </div>
  );
};

export default TopBar;
