import React, { useState, useEffect } from "react";
import Dashboard from "./Dashboard";
import TopBar from "./TopBar";
import { GeneralContextProvider } from "./GeneralContext";

const Home = () => {
  const [isGuest, setIsGuest] = useState(false);
  const [showTrialBanner, setShowTrialBanner] = useState(true);

  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token");
      const user = urlParams.get("user");
      if (token) {
        localStorage.setItem("token", token);
      }
      if (user) {
        localStorage.setItem("user", decodeURIComponent(user));
      }
      if (token || user) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      const activeToken = localStorage.getItem("token");
      setIsGuest(!activeToken);
    } catch (e) {
      console.warn("Error synchronizing cross-origin session:", e);
    }
  }, []);

  return (
    <GeneralContextProvider>
      {isGuest && showTrialBanner && (
        <div
          style={{
            backgroundColor: "#fff9e6",
            borderBottom: "1px solid #ffe8b3",
            padding: "8px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.85rem",
            color: "#7d5200",
            zIndex: 100,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span
              style={{
                backgroundColor: "#ff9800",
                color: "#fff",
                fontWeight: "700",
                padding: "2px 8px",
                borderRadius: "3px",
                fontSize: "0.72rem",
                letterSpacing: "0.5px",
              }}
            >
              GUEST TRIAL
            </span>
            <span>
              You are exploring Kite in <strong>Guest Paper-Trading Mode</strong> with virtual margin.
              <strong> Sign in or register to permanently save your orders and portfolio!</strong>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <a
              href="/signup"
              style={{
                backgroundColor: "#387ed1",
                color: "#fff",
                padding: "4px 14px",
                borderRadius: "3px",
                textDecoration: "none",
                fontWeight: "600",
                fontSize: "0.8rem",
                whiteSpace: "nowrap",
              }}
            >
              Log In / Sign Up
            </a>
            <button
              onClick={() => setShowTrialBanner(false)}
              style={{
                background: "none",
                border: "none",
                color: "#9c7000",
                cursor: "pointer",
                fontSize: "1rem",
                padding: "0 4px",
                lineHeight: 1,
              }}
              title="Dismiss banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <TopBar />
      <Dashboard />
    </GeneralContextProvider>
  );
};

export default Home;
