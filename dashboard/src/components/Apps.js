import React, { useState } from "react";

const appsList = [
  {
    id: "smallcase",
    name: "Smallcase",
    category: "Thematic Investing",
    tag: "Featured",
    logoColor: "#1e88e5",
    description: "Thematic investing platform that helps you invest in diversified baskets of stocks and ETFs based on ideas, sectors, and models.",
    features: ["Model portfolios", "Zero lock-in", "SIP enabled", "Track performance"],
    url: "https://smallcase.zerodha.com",
  },
  {
    id: "sensibull",
    name: "Sensibull",
    category: "Options Trading",
    tag: "Options & F&O",
    logoColor: "#7c4dff",
    description: "India's largest options trading platform. Analyze options strategies, calculate payoff graphs, find trades, and analyze open interest.",
    features: ["Strategy builder", "Payoff analyzer", "Live Greeks", "F&O Screeners"],
    url: "https://sensibull.com",
  },
  {
    id: "streak",
    name: "Streak",
    category: "Algo & Tech Trading",
    tag: "No-Code Algo",
    logoColor: "#00b0ff",
    description: "Systematic trading platform for retail traders. Create, backtest, and deploy trading algorithms and strategies without coding.",
    features: ["No coding required", "Backtesting engine", "Dynamic scanners", "Real-time alerts"],
    url: "https://streak.tech",
  },
  {
    id: "tijori",
    name: "Tijori",
    category: "Fundamental Research",
    tag: "Research",
    logoColor: "#00bfa5",
    description: "Deep fundamental research platform for Indian companies, sector revenue breakdown, operational metrics, and raw material tracking.",
    features: ["Revenue breakdown", "Supply chain maps", "Peer comparison", "Capex tracker"],
    url: "https://tijorifinance.com",
  },
  {
    id: "quicko",
    name: "Quicko",
    category: "Tax & Compliance",
    tag: "Taxation",
    logoColor: "#ff9100",
    description: "Tax filing and planning platform specifically designed for stock, crypto, and derivative traders with direct Zerodha P&L import.",
    features: ["1-click P&L import", "Automated ITR-3", "Tax loss harvesting", "CA assistance"],
    url: "https://quicko.com",
  },
  {
    id: "fundhouse",
    name: "Zerodha Fund House",
    category: "Mutual Funds & ETFs",
    tag: "Passive Funds",
    logoColor: "#43a047",
    description: "Simple, transparent, and low-cost passive index funds and ETFs designed to help retail investors build long-term wealth.",
    features: ["Ultra low expense", "Direct indexing", "Nifty 100 Index", "Liquid funds"],
    url: "https://zerodhafundhouse.com",
  },
  {
    id: "varsity",
    name: "Varsity by Zerodha",
    category: "Education & Learning",
    tag: "Free Certified",
    logoColor: "#3949ab",
    description: "In-depth collection of stock market and financial education modules covering basics, technicals, fundamentals, and currencies.",
    features: ["14+ complete modules", "Certification quizzes", "Interactive illustrations", "Free for all"],
    url: "https://zerodha.com/varsity",
  },
  {
    id: "goldenpi",
    name: "GoldenPi",
    category: "Bonds & Fixed Income",
    tag: "Fixed Income",
    logoColor: "#e91e63",
    description: "Online bond platform for retail investors to invest in corporate bonds, Government securities (G-Secs), and secondary market debentures.",
    features: ["Fixed predictable returns", "Curated AAA bonds", "Direct demat credit", "Low risk profile"],
    url: "https://goldenpi.com",
  },
];

const Apps = () => {
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = ["All", "Thematic Investing", "Options Trading", "Algo & Tech Trading", "Fundamental Research", "Tax & Compliance", "Education & Learning"];

  const filteredApps = activeCategory === "All"
    ? appsList
    : appsList.filter((a) => a.category === activeCategory);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "10px 0 40px 0" }}>
      {/* Header Banner */}
      <div style={{ marginBottom: "28px" }}>
        <h3 className="title" style={{ margin: "0 0 6px 0", fontSize: "1.4rem", fontWeight: "400", color: "#333" }}>
          Zerodha Universe & Partner Apps
        </h3>
        <p style={{ margin: 0, color: "#777", fontSize: "0.85rem", lineHeight: "1.5" }}>
          Explore seamless trading tools, research engines, algorithmic suites, and investment platforms powered by the Zerodha ecosystem.
        </p>
      </div>

      {/* Category Pills */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              border: activeCategory === cat ? "1px solid #387ed1" : "1px solid #e0e0e0",
              background: activeCategory === cat ? "#387ed1" : "#fff",
              color: activeCategory === cat ? "#fff" : "#555",
              padding: "6px 14px",
              borderRadius: "20px",
              fontSize: "0.78rem",
              fontWeight: activeCategory === cat ? "500" : "400",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Apps Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "20px",
        }}
      >
        {filteredApps.map((app) => (
          <div
            key={app.id}
            style={{
              background: "#ffffff",
              border: "1px solid #eaeaea",
              borderRadius: "6px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "6px",
                      background: app.logoColor,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.1rem",
                      fontWeight: "700",
                    }}
                  >
                    {app.name.charAt(0)}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: "600", color: "#333" }}>
                      {app.name}
                    </h4>
                    <span style={{ fontSize: "0.72rem", color: "#888" }}>{app.category}</span>
                  </div>
                </div>

                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: "600",
                    padding: "2px 8px",
                    borderRadius: "10px",
                    background: "#f0f4f8",
                    color: "#387ed1",
                  }}
                >
                  {app.tag}
                </span>
              </div>

              <p style={{ fontSize: "0.82rem", color: "#666", lineHeight: "1.45", margin: "0 0 16px 0", minHeight: "48px" }}>
                {app.description}
              </p>

              {/* Feature Tags */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "18px" }}>
                {app.features.map((feat, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: "0.7rem",
                      background: "#fafafa",
                      border: "1px solid #f0f0f0",
                      padding: "2px 8px",
                      borderRadius: "3px",
                      color: "#555",
                    }}
                  >
                    ✓ {feat}
                  </span>
                ))}
              </div>
            </div>

            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                textAlign: "center",
                padding: "8px 14px",
                background: "#f7f9fa",
                border: "1px solid #e2e8f0",
                color: "#387ed1",
                textDecoration: "none",
                borderRadius: "4px",
                fontSize: "0.82rem",
                fontWeight: "500",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#387ed1";
                e.currentTarget.style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#f7f9fa";
                e.currentTarget.style.color = "#387ed1";
              }}
            >
              Launch {app.name} →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Apps;
