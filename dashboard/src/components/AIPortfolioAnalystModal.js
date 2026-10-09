import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";

const AIPortfolioAnalystModal = ({ onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post("http://localhost:3001/api/portfolio/analyze", {}, { withCredentials: true });
      if (res.data && res.data.success) {
        setData(res.data);
      } else {
        setError(res.data?.message || "Failed to generate portfolio analysis");
      }
    } catch (err) {
      console.error("AI Portfolio Analysis fetch error:", err);
      setError("Unable to connect to AI Portfolio Analyst service. Please verify server status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  const metrics = data?.metrics || {};
  const analysis = data?.analysis || {};
  const isProfit = (metrics.totalPnL || 0) >= 0;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1200,
        animation: "fadeIn 0.15s ease",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          width: "880px",
          maxWidth: "95vw",
          maxHeight: "90vh",
          borderRadius: "6px",
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #eaeaea",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#fbfbfb",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                background: "linear-gradient(135deg, #387ed1, #7c4dff)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1rem",
                fontWeight: "bold",
              }}
            >
              ✦
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: "600", color: "#333" }}>
                  AI Portfolio Analyst
                </h3>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: "600",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: data?.source === "gemini-2.5-flash" ? "#ede7f6" : "#e8f0fe",
                    color: data?.source === "gemini-2.5-flash" ? "#5e35b1" : "#1967d2",
                  }}
                >
                  {data?.source === "gemini-2.5-flash" ? "Powered by Gemini 2.5 Flash" : "Authoritative Financial Engine"}
                </span>
              </div>
              <span style={{ fontSize: "0.75rem", color: "#777" }}>
                Authoritative portfolio diagnostics, risk exposure, and concentration insights
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={fetchAnalysis}
              disabled={loading}
              style={{
                background: "#f0f4f8",
                border: "1px solid #d0d7de",
                padding: "6px 12px",
                borderRadius: "3px",
                fontSize: "0.78rem",
                color: "#387ed1",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: "500",
              }}
            >
              {loading ? "Analyzing..." : "↻ Refresh Analysis"}
            </button>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid #ddd",
                borderRadius: "3px",
                padding: "4px 10px",
                fontSize: "1.1rem",
                cursor: "pointer",
                color: "#666",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {loading && (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "12px", animation: "spin 1.5s linear infinite" }}>✦</div>
              <h4 style={{ margin: "0 0 6px 0", fontSize: "1.05rem", fontWeight: "500", color: "#444" }}>
                Analyzing Portfolio Metrics & Sector Risk...
              </h4>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#888" }}>
                Evaluating concentration, beta exposures, and unrealized gains across holdings.
              </p>
            </div>
          )}

          {error && !loading && (
            <div
              style={{
                padding: "16px",
                background: "#fef2f2",
                border: "1px solid #fee2e2",
                borderRadius: "4px",
                color: "#b91c1c",
                fontSize: "0.85rem",
                marginBottom: "16px",
              }}
            >
              <strong>Analysis Notice:</strong> {error}
              <div style={{ marginTop: "10px" }}>
                <button
                  onClick={fetchAnalysis}
                  style={{
                    padding: "4px 12px",
                    background: "#b91c1c",
                    color: "#fff",
                    border: "none",
                    borderRadius: "3px",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                  }}
                >
                  Retry Analysis
                </button>
              </div>
            </div>
          )}

          {!loading && !error && data && (
            <div>
              {/* Financial Snapshot Ribbon */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "12px",
                  marginBottom: "20px",
                }}
              >
                <div style={{ background: "#f8f9fa", border: "1px solid #eaeaea", borderRadius: "4px", padding: "12px" }}>
                  <div style={{ fontSize: "0.72rem", color: "#888", textTransform: "uppercase" }}>Current Value</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: "600", color: "#333" }}>
                    ₹{metrics.totalCurrentValue?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#666" }}>Invested: ₹{metrics.totalInvestment?.toLocaleString()}</div>
                </div>

                <div style={{ background: "#f8f9fa", border: "1px solid #eaeaea", borderRadius: "4px", padding: "12px" }}>
                  <div style={{ fontSize: "0.72rem", color: "#888", textTransform: "uppercase" }}>Net Return (P&L)</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: "600", color: isProfit ? "#4caf50" : "#df4949" }}>
                    {isProfit ? "+" : ""}₹{metrics.totalPnL?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: isProfit ? "#4caf50" : "#df4949" }}>
                    {isProfit ? "+" : ""}{metrics.pnlPercent?.toFixed(2)}% Overall
                  </div>
                </div>

                <div style={{ background: "#f8f9fa", border: "1px solid #eaeaea", borderRadius: "4px", padding: "12px" }}>
                  <div style={{ fontSize: "0.72rem", color: "#888", textTransform: "uppercase" }}>Top Asset Weight</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: "600", color: "#387ed1" }}>
                    {metrics.topHolding?.name} ({metrics.topHolding?.weightPercent}%)
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#666" }}>{metrics.holdingsCount} Total Holdings</div>
                </div>

                <div style={{ background: "#f8f9fa", border: "1px solid #eaeaea", borderRadius: "4px", padding: "12px" }}>
                  <div style={{ fontSize: "0.72rem", color: "#888", textTransform: "uppercase" }}>Liquid Cash Buffer</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: "600", color: "#333" }}>
                    ₹{metrics.availableCash?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#666" }}>{metrics.cashRatioPercent}% Capital Allocation</div>
                </div>
              </div>

              {/* 5 Structured Analysis Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* 1. Overview */}
                <div style={{ border: "1px solid #eaeaea", borderRadius: "5px", padding: "16px", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "1rem" }}>📊</span>
                    <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: "600", color: "#333" }}>
                      Portfolio Composition & Performance Overview
                    </h4>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.84rem", color: "#555", lineHeight: "1.55" }}>
                    {analysis.overview}
                  </p>
                </div>

                {/* 2. Gainers & Losers */}
                <div style={{ border: "1px solid #eaeaea", borderRadius: "5px", padding: "16px", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "1rem" }}>🚀</span>
                    <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: "600", color: "#333" }}>
                      Top Value Drivers & Underperforming Drags
                    </h4>
                  </div>
                  <p style={{ margin: "0 0 10px 0", fontSize: "0.84rem", color: "#555", lineHeight: "1.55" }}>
                    {analysis.topGainersLosers}
                  </p>
                  {metrics.topGainers?.length > 0 && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {metrics.topGainers.map((g, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "0.75rem",
                            background: "#e8f5e9",
                            color: "#2e7d32",
                            padding: "3px 8px",
                            borderRadius: "3px",
                            fontWeight: "500",
                          }}
                        >
                          ▲ {g.name}: {g.pnlPercent >= 0 ? "+" : ""}{g.pnlPercent.toFixed(1)}% (+₹{g.pnl?.toLocaleString()})
                        </span>
                      ))}
                      {metrics.topLosers?.map((l, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "0.75rem",
                            background: "#ffebee",
                            color: "#c62828",
                            padding: "3px 8px",
                            borderRadius: "3px",
                            fontWeight: "500",
                          }}
                        >
                          ▼ {l.name}: {l.pnlPercent.toFixed(1)}% (₹{l.pnl?.toLocaleString()})
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Concentration */}
                <div style={{ border: "1px solid #eaeaea", borderRadius: "5px", padding: "16px", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "1rem" }}>🎯</span>
                    <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: "600", color: "#333" }}>
                      Asset & Sector Concentration Breakdown
                    </h4>
                  </div>
                  <p style={{ margin: "0 0 10px 0", fontSize: "0.84rem", color: "#555", lineHeight: "1.55" }}>
                    {analysis.concentrationAnalysis}
                  </p>
                  {metrics.sectorBreakdown && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {Object.entries(metrics.sectorBreakdown).map(([sec, pct], i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "0.72rem",
                            background: "#f0f4f8",
                            color: "#475569",
                            padding: "2px 8px",
                            borderRadius: "3px",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {sec}: <strong>{pct}%</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Risk Observations */}
                <div style={{ border: "1px solid #eaeaea", borderRadius: "5px", padding: "16px", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "1rem" }}>⚠️</span>
                    <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: "600", color: "#333" }}>
                      Risk Observations & Capital Protection
                    </h4>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.84rem", color: "#555", lineHeight: "1.55" }}>
                    {analysis.riskObservations}
                  </p>
                </div>

                {/* 5. Actionable Research */}
                <div style={{ border: "1px solid #eaeaea", borderRadius: "5px", padding: "16px", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "1rem" }}>💡</span>
                    <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: "600", color: "#333" }}>
                      Actionable Research Avenues
                    </h4>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.84rem", color: "#555", lineHeight: "1.55" }}>
                    {analysis.actionableSuggestions}
                  </p>
                </div>
              </div>

              {/* Disclaimer */}
              <div
                style={{
                  marginTop: "16px",
                  padding: "10px 14px",
                  background: "#f8fafc",
                  borderRadius: "4px",
                  borderLeft: "3px solid #94a3b8",
                  fontSize: "0.73rem",
                  color: "#64748b",
                  lineHeight: "1.45",
                }}
              >
                <strong>Educational Notice:</strong> {data.disclaimer}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIPortfolioAnalystModal;
