import React, { useState, useEffect, useContext } from "react";
import GeneralContext from "./GeneralContext";

const Summary = () => {
  const [username, setUsername] = useState("User");
  const { funds, holdings, openAIAnalystWindow } = useContext(GeneralContext);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed.username) setUsername(parsed.username);
      } catch (e) {}
    }
  }, []);

  // Compute live portfolio metrics from real-time holdings
  let totalInvestment = 0;
  let totalCurrentValue = 0;

  (holdings || []).forEach((stock) => {
    const qty = Number(stock.qty) || 0;
    const avg = Number(stock.avg) || 0;
    const price = Number(stock.price) || 0;
    totalInvestment += avg * qty;
    totalCurrentValue += price * qty;
  });

  const totalPnL = totalCurrentValue - totalInvestment;
  const pnlPercent = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;
  const isProfit = totalPnL >= 0;

  const formatCurrency = (val) => {
    if (Math.abs(val) >= 100000) {
      return (val / 100000).toFixed(2) + "L";
    }
    if (Math.abs(val) >= 1000) {
      return (val / 1000).toFixed(2) + "k";
    }
    return Number(val || 0).toFixed(2);
  };

  return (
    <>
      <div className="username" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h6 style={{ margin: 0 }}>Hi, {username}!</h6>
        <button
          onClick={openAIAnalystWindow}
          style={{
            background: "linear-gradient(135deg, #387ed1, #7c4dff)",
            color: "#fff",
            border: "none",
            padding: "8px 16px",
            borderRadius: "4px",
            fontSize: "0.82rem",
            fontWeight: "500",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 2px 6px rgba(56, 126, 209, 0.25)",
            transition: "all 0.15s ease",
          }}
        >
          <span>✦</span>
          <span>AI Portfolio Analyst</span>
        </button>
      </div>
      <hr className="divider" />

      <div className="section">
        <span>
          <p>Equity</p>
        </span>

        <div className="data">
          <div className="first">
            <h3>₹{formatCurrency(funds.availableMargin || funds.availableCash)}</h3>
            <p>Margin available</p>
          </div>
          <hr />

          <div className="second">
            <p>
              Margins used <span>₹{formatCurrency(funds.usedMargin || 0)}</span>{" "}
            </p>
            <p>
              Opening balance <span>₹{formatCurrency(funds.openingBalance || 100000)}</span>{" "}
            </p>
          </div>
        </div>
        <hr className="divider" />
      </div>

      <div className="section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2%" }}>
          <span style={{ margin: 0 }}>
            <p style={{ margin: 0 }}>Holdings ({holdings.length})</p>
          </span>
          <button
            onClick={openAIAnalystWindow}
            style={{
              background: "transparent",
              border: "1px solid #d0d7de",
              color: "#387ed1",
              fontSize: "0.75rem",
              padding: "4px 10px",
              borderRadius: "3px",
              cursor: "pointer",
              fontWeight: "500",
            }}
          >
            ✦ Analyze Portfolio
          </button>
        </div>

        <div className="data">
          <div className="first">
            <h3 className={isProfit ? "profit" : "loss"}>
              ₹{formatCurrency(totalPnL)}{" "}
              <small className={isProfit ? "profit" : "loss"}>
                {isProfit ? "+" : ""}{pnlPercent.toFixed(2)}%
              </small>{" "}
            </h3>
            <p>P&L</p>
          </div>
          <hr />

          <div className="second">
            <p>
              Current Value <span>₹{formatCurrency(totalCurrentValue)}</span>{" "}
            </p>
            <p>
              Investment <span>₹{formatCurrency(totalInvestment)}</span>{" "}
            </p>
          </div>
        </div>
        <hr className="divider" />
      </div>
    </>
  );
};

export default Summary;
