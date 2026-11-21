import React, { useState, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import Apps from "./Apps";
import Funds from "./Funds";
import Holdings from "./Holdings";
import Orders from "./Orders";
import Positions from "./Positions";
import Summary from "./Summary";
import WatchList from "./WatchList";

const Dashboard = () => {
  const [mobileTab, setMobileTab] = useState("content"); // "watchlist" | "content"
  const location = useLocation();

  // When route changes (e.g. user selected Orders / Holdings from menu), automatically switch to content view on mobile
  useEffect(() => {
    setMobileTab("content");
  }, [location.pathname]);

  const getPageTitle = () => {
    const path = location.pathname.replace(/^\/dashboard/, "");
    switch (path) {
      case "/orders":
        return "Orders";
      case "/holdings":
        return "Holdings";
      case "/positions":
        return "Positions";
      case "/funds":
        return "Funds";
      case "/apps":
        return "Apps";
      default:
        return "Dashboard";
    }
  };

  return (
    <div className="dashboard-container">
      {/* Mobile View Tab Selector (< 768px only) */}
      <div className="mobile-view-toggle">
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === "watchlist" ? "active" : ""}`}
          onClick={() => setMobileTab("watchlist")}
        >
          <span>Market Watch</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === "content" ? "active" : ""}`}
          onClick={() => setMobileTab("content")}
        >
          <span>{getPageTitle()}</span>
        </button>
      </div>

      {/* Watchlist Section */}
      <div className={`dashboard-watchlist-section ${mobileTab === "watchlist" ? "mobile-active" : "mobile-inactive"}`}>
        <WatchList />
      </div>

      {/* Main Content Area */}
      <div className={`content ${mobileTab === "content" ? "mobile-active" : "mobile-inactive"}`}>
        <Routes>
          <Route exact path="/" element={<Summary />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/holdings" element={<Holdings />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/funds" element={<Funds />} />
          <Route path="/apps" element={<Apps />} />
        </Routes>
      </div>
    </div>
  );
};

export default Dashboard;
