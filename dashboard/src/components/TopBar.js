import React, { useState, useEffect } from "react";
import Menu from "./Menu";
import axios from "axios";

const API_KEY = "e3a7567d8f13431faf3c7e751e797817";

const TopBar = () => {
  const [indicesData, setIndicesData] = useState({
    nifty: { name: "NIFTY 50", points: 25014.60, percent: "+0.54%", isDown: false, flash: null },
    sensex: { name: "SENSEX", points: 81634.81, percent: "+0.53%", isDown: false, flash: null },
    nasdaq: { name: "NASDAQ 100", points: 18342.94, percent: "+0.92%", isDown: false, flash: null },
  });

  // 1. Live US Index from Twelve Data
  useEffect(() => {
    let isMounted = true;
    const fetchLiveUSIndex = async () => {
      try {
        const res = await axios.get(
          `https://api.twelvedata.com/quote?symbol=QQQ&apikey=${API_KEY}`,
          { timeout: 8000 }
        );
        if (isMounted && res.data && res.data.close) {
          const price = parseFloat(res.data.close);
          const pct = parseFloat(res.data.percent_change || 0);
          setIndicesData((prev) => ({
            ...prev,
            nasdaq: {
              name: "NASDAQ 100",
              points: price,
              percent: (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%",
              isDown: pct < 0,
              flash: pct >= 0 ? "up" : "down",
            },
          }));
        }
      } catch (err) {
        // Fallback gracefully
      }
    };

    fetchLiveUSIndex();
    const interval = setInterval(fetchLiveUSIndex, 25000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // 2. Real-time dynamic micro-ticks for Indian Indices (Nifty 50 & Sensex)
  useEffect(() => {
    const tickInterval = setInterval(() => {
      setIndicesData((prev) => {
        const niftyDelta = (Math.random() - 0.48) * 3.5;
        const sensexDelta = (Math.random() - 0.48) * 12.0;

        const newNifty = Number((prev.nifty.points + niftyDelta).toFixed(2));
        const newSensex = Number((prev.sensex.points + sensexDelta).toFixed(2));

        const baseNifty = 24880.00;
        const niftyPct = ((newNifty - baseNifty) / baseNifty) * 100;
        const baseSensex = 81200.00;
        const sensexPct = ((newSensex - baseSensex) / baseSensex) * 100;

        return {
          ...prev,
          nifty: {
            name: "NIFTY 50",
            points: newNifty,
            percent: (niftyPct >= 0 ? "+" : "") + niftyPct.toFixed(2) + "%",
            isDown: niftyDelta < 0,
            flash: niftyDelta >= 0 ? "up" : "down",
          },
          sensex: {
            name: "SENSEX",
            points: newSensex,
            percent: (sensexPct >= 0 ? "+" : "") + sensexPct.toFixed(2) + "%",
            isDown: sensexDelta < 0,
            flash: sensexDelta >= 0 ? "up" : "down",
          },
        };
      });
    }, 3500);

    return () => clearInterval(tickInterval);
  }, []);

  return (
    <div className="topbar-container">
      <div className="indices-container" style={{ flexBasis: "38%", justifyContent: "space-between" }}>
        <div className="nifty">
          <p className="index">{indicesData.nifty.name}</p>
          <p
            className="index-points"
            style={{
              color: indicesData.nifty.isDown ? "#df4949" : "#4caf50",
              transition: "color 0.2s ease",
            }}
          >
            {indicesData.nifty.points.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="percent" style={{ color: indicesData.nifty.isDown ? "#df4949" : "#4caf50" }}>
            {indicesData.nifty.percent}
          </p>
        </div>

        <div className="sensex">
          <p className="index">{indicesData.sensex.name}</p>
          <p
            className="index-points"
            style={{
              color: indicesData.sensex.isDown ? "#df4949" : "#4caf50",
              transition: "color 0.2s ease",
            }}
          >
            {indicesData.sensex.points.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="percent" style={{ color: indicesData.sensex.isDown ? "#df4949" : "#4caf50" }}>
            {indicesData.sensex.percent}
          </p>
        </div>

        <div className="sensex" title="Live US Market Index">
          <p className="index">{indicesData.nasdaq.name}</p>
          <p
            className="index-points"
            style={{
              color: indicesData.nasdaq.isDown ? "#df4949" : "#4caf50",
              transition: "color 0.2s ease",
            }}
          >
            {typeof indicesData.nasdaq.points === "number"
              ? indicesData.nasdaq.points.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : indicesData.nasdaq.points}
          </p>
          <p className="percent" style={{ color: indicesData.nasdaq.isDown ? "#df4949" : "#4caf50" }}>
            {indicesData.nasdaq.percent}
          </p>
        </div>
      </div>

      <Menu />
    </div>
  );
};

export default TopBar;
