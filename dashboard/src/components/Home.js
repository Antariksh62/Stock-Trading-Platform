import React, { useState, useEffect } from "react";
import Dashboard from "./Dashboard";
import TopBar from "./TopBar";
import { GeneralContextProvider } from "./GeneralContext";
import { FRONTEND_URL } from "../config";

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

  const signupUrl = FRONTEND_URL ? `${FRONTEND_URL}/signup` : "/signup";
  const loginUrl = FRONTEND_URL ? `${FRONTEND_URL}/login` : "/login";

  return (
    <GeneralContextProvider>
      {isGuest && showTrialBanner && (
        <div
          className="trial-banner"
          style={{
            position: "relative",
            zIndex: 1000,
            isolation: "isolate",
            backgroundColor: "#fff9e6",
            borderBottom: "1px solid #ffe8b3",
            padding: "8px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.82rem",
            color: "#7d5200",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            gap: "12px",
            flexWrap: "wrap",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {/* Informational Message */}
          <div
            className="trial-banner-message"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flex: "1 1 280px",
              minWidth: 0,
            }}
          >
            <span
              style={{
                backgroundColor: "#ff9800",
                color: "#fff",
                fontWeight: "700",
                padding: "2px 7px",
                borderRadius: "3px",
                fontSize: "0.7rem",
                letterSpacing: "0.5px",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              GUEST TRIAL
            </span>
            <span style={{ lineHeight: "1.4", color: "#6d4700" }}>
              You are exploring Kite in <strong>Guest Paper-Trading Mode</strong> with virtual margin.
              <span className="trial-banner-desktop-text"> Sign in or register to permanently save your orders and portfolio!</span>
            </span>
          </div>

          {/* Action Buttons: Log In, Sign Up, Dismiss */}
          <div
            className="trial-banner-actions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexShrink: 0,
              position: "relative",
              zIndex: 10,
              pointerEvents: "auto",
            }}
          >
            {/* Dedicated Log In Button */}
            <a
              href={loginUrl}
              className="trial-btn trial-btn-login"
              style={{
                backgroundColor: "#ffffff",
                color: "#387ed1",
                border: "1.5px solid #387ed1",
                padding: "5px 14px",
                borderRadius: "3px",
                textDecoration: "none",
                fontWeight: "600",
                fontSize: "0.78rem",
                whiteSpace: "nowrap",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "30px",
                boxSizing: "border-box",
                transition: "all 0.15s ease",
                userSelect: "none",
                pointerEvents: "auto",
              }}
              title="Log in to existing Zerodha account"
            >
              Log In
            </a>

            {/* Dedicated Sign Up Button */}
            <a
              href={signupUrl}
              className="trial-btn trial-btn-signup"
              style={{
                backgroundColor: "#387ed1",
                color: "#ffffff",
                border: "1.5px solid #387ed1",
                padding: "5px 14px",
                borderRadius: "3px",
                textDecoration: "none",
                fontWeight: "600",
                fontSize: "0.78rem",
                whiteSpace: "nowrap",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "30px",
                boxSizing: "border-box",
                transition: "all 0.15s ease",
                userSelect: "none",
                pointerEvents: "auto",
                boxShadow: "0 1px 2px rgba(56, 126, 209, 0.2)",
              }}
              title="Create a new free trading account"
            >
              Sign Up
            </a>

            {/* Dismiss Banner Button */}
            <button
              type="button"
              onClick={() => setShowTrialBanner(false)}
              className="trial-btn-dismiss"
              style={{
                background: "none",
                border: "none",
                color: "#9c7000",
                cursor: "pointer",
                fontSize: "1.1rem",
                padding: "4px 8px",
                lineHeight: 1,
                borderRadius: "3px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "auto",
                transition: "background 0.15s ease",
              }}
              title="Dismiss banner"
              aria-label="Dismiss banner"
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
