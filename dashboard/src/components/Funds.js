import React, { useState, useEffect, useContext } from "react";
import axios from "axios";
import GeneralContext from "./GeneralContext";

const Funds = () => {
  const { funds, refreshData } = useContext(GeneralContext);

  const [hasCommodityAccount, setHasCommodityAccount] = useState(() => {
    return localStorage.getItem("has_commodity") === "true";
  });

  const [commodityFunds] = useState(() => {
    const saved = localStorage.getItem("user_commodity_funds");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      availableMargin: 25000.00,
      usedMargin: 0.00,
      availableCash: 25000.00,
      openingBalance: 25000.00,
      payin: 0.00,
    };
  });

  const [modalMode, setModalMode] = useState(null); // 'add' | 'withdraw' | null
  const [amountInput, setAmountInput] = useState("");
  const [upiIdInput, setUpiIdInput] = useState("user@okaxis");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    localStorage.setItem("has_commodity", hasCommodityAccount ? "true" : "false");
  }, [hasCommodityAccount]);

  const handleTransaction = async (e) => {
    e.preventDefault();
    const val = parseFloat(amountInput);
    if (!val || val <= 0) {
      setMessage("Please enter a valid amount greater than ₹0");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      if (modalMode === "add") {
        const res = await axios.post("http://localhost:3001/api/funds/add", { amount: val }, { withCredentials: true });
        if (res.data && res.data.success) {
          setMessage(`Successfully added ₹${val.toLocaleString()} via UPI (${upiIdInput})`);
          setTimeout(() => {
            setModalMode(null);
            setAmountInput("");
            setMessage("");
            refreshData();
          }, 1200);
        } else {
          setMessage(res.data?.message || "Failed to process UPI deposit");
        }
      } else if (modalMode === "withdraw") {
        const res = await axios.post("http://localhost:3001/api/funds/withdraw", { amount: val }, { withCredentials: true });
        if (res.data && res.data.success) {
          setMessage(`Withdrawal request for ₹${val.toLocaleString()} initiated to linked bank account`);
          setTimeout(() => {
            setModalMode(null);
            setAmountInput("");
            setMessage("");
            refreshData();
          }, 1200);
        } else {
          setMessage(res.data?.message || "Withdrawal failed");
        }
      }
    } catch (err) {
      setMessage(err.response?.data?.message || "Transaction error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleActivateCommodity = () => {
    setHasCommodityAccount(true);
  };

  return (
    <div style={{ maxWidth: "1050px", margin: "0 auto" }}>
      {/* Top Banner & Quick Transfer Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 0",
          borderBottom: "1px solid #eee",
          marginBottom: "24px",
        }}
      >
        <div>
          <span style={{ fontSize: "0.85rem", color: "#666" }}>
            Instant, zero-cost fund transfers with UPI & Netbanking
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className="btn btn-green"
            onClick={() => {
              setModalMode("add");
              setAmountInput("");
              setMessage("");
            }}
            style={{
              border: "none",
              cursor: "pointer",
              padding: "8px 20px",
              borderRadius: "3px",
              fontWeight: "500",
              fontSize: "0.85rem",
            }}
          >
            Add funds
          </button>
          <button
            className="btn btn-blue"
            onClick={() => {
              setModalMode("withdraw");
              setAmountInput("");
              setMessage("");
            }}
            style={{
              border: "none",
              cursor: "pointer",
              padding: "8px 20px",
              borderRadius: "3px",
              fontWeight: "500",
              fontSize: "0.85rem",
            }}
          >
            Withdraw
          </button>
        </div>
      </div>

      {/* Main 2-Column Split: Equity & Commodity */}
      <div className="row" style={{ marginTop: "10px", alignItems: "flex-start", gap: "28px" }}>
        {/* Equity Segment */}
        <div className="col" style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <span style={{ fontSize: "1.15rem", fontWeight: "400", color: "#444" }}>Equity Segment</span>
            <span style={{ fontSize: "0.72rem", background: "#e8f0fe", color: "#1967d2", padding: "2px 6px", borderRadius: "3px" }}>
              Active
            </span>
          </div>

          <div
            className="table"
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "4px",
              padding: "20px 24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            }}
          >
            <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
              <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>Available margin</p>
              <p className="imp colored" style={{ margin: 0, fontWeight: "600", fontSize: "1.3rem", color: "#387ed1" }}>
                ₹{(funds.availableMargin || funds.availableCash || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
              <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>Used margin</p>
              <p className="imp" style={{ margin: 0, fontWeight: "500", fontSize: "1.1rem", color: "#333" }}>
                ₹{(funds.usedMargin || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
              <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>Available cash</p>
              <p className="imp" style={{ margin: 0, fontWeight: "500", fontSize: "1.1rem", color: "#333" }}>
                ₹{(funds.availableCash || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #f0f0f0", margin: "14px 0" }} />

            <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <p style={{ margin: 0, color: "#888", fontSize: "0.85rem" }}>Opening Balance</p>
              <p style={{ margin: 0, color: "#444", fontSize: "0.85rem", fontWeight: "500" }}>
                ₹{(funds.openingBalance || 100000).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <p style={{ margin: 0, color: "#888", fontSize: "0.85rem" }}>Payin</p>
              <p style={{ margin: 0, color: "#4caf50", fontSize: "0.85rem", fontWeight: "500" }}>
                +₹{(funds.payin || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <p style={{ margin: 0, color: "#888", fontSize: "0.85rem" }}>SPAN Margin</p>
              <p style={{ margin: 0, color: "#444", fontSize: "0.85rem" }}>₹{(funds.span || 0).toFixed(2)}</p>
            </div>
            <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <p style={{ margin: 0, color: "#888", fontSize: "0.85rem" }}>Delivery margin</p>
              <p style={{ margin: 0, color: "#444", fontSize: "0.85rem" }}>₹{(funds.deliveryMargin || 0).toFixed(2)}</p>
            </div>
            <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <p style={{ margin: 0, color: "#888", fontSize: "0.85rem" }}>Exposure</p>
              <p style={{ margin: 0, color: "#444", fontSize: "0.85rem" }}>₹{(funds.exposure || 0).toFixed(2)}</p>
            </div>
            <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <p style={{ margin: 0, color: "#888", fontSize: "0.85rem" }}>Options premium</p>
              <p style={{ margin: 0, color: "#444", fontSize: "0.85rem" }}>₹{(funds.optionsPremium || 0).toFixed(2)}</p>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #f0f0f0", margin: "14px 0" }} />

            <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <p style={{ margin: 0, color: "#888", fontSize: "0.82rem" }}>Collateral (Liquid funds)</p>
              <p style={{ margin: 0, color: "#666", fontSize: "0.82rem" }}>₹0.00</p>
            </div>
            <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <p style={{ margin: 0, color: "#888", fontSize: "0.82rem" }}>Collateral (Equity)</p>
              <p style={{ margin: 0, color: "#666", fontSize: "0.82rem" }}>₹0.00</p>
            </div>
            <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between" }}>
              <p style={{ margin: 0, color: "#888", fontSize: "0.82rem", fontWeight: "600" }}>Total Collateral</p>
              <p style={{ margin: 0, color: "#444", fontSize: "0.82rem", fontWeight: "600" }}>₹0.00</p>
            </div>
          </div>
        </div>

        {/* Commodity Segment */}
        <div className="col" style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <span style={{ fontSize: "1.15rem", fontWeight: "400", color: "#444" }}>Commodity Segment (MCX)</span>
            {hasCommodityAccount && (
              <span style={{ fontSize: "0.72rem", background: "#e8f5e9", color: "#2e7d32", padding: "2px 6px", borderRadius: "3px" }}>
                Active
              </span>
            )}
          </div>

          {!hasCommodityAccount ? (
            <div
              style={{
                background: "#fdfdfd",
                border: "1px dashed #d0d7de",
                borderRadius: "4px",
                padding: "48px 24px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "12px", color: "#9ca3af" }}>🪙</div>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "1rem", fontWeight: "500", color: "#444" }}>
                Commodity Account Not Activated
              </h4>
              <p style={{ fontSize: "0.82rem", color: "#777", maxWidth: "340px", margin: "0 auto 20px auto", lineHeight: "1.45" }}>
                Trade Gold, Silver, Crude Oil, Natural Gas, and Agri commodities directly on MCX.
              </p>
              <button
                className="btn btn-blue"
                onClick={handleActivateCommodity}
                style={{
                  border: "none",
                  cursor: "pointer",
                  padding: "10px 24px",
                  borderRadius: "3px",
                  fontWeight: "500",
                  fontSize: "0.85rem",
                }}
              >
                Activate Commodity Account
              </button>
            </div>
          ) : (
            <div
              className="table"
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "4px",
                padding: "20px 24px",
              }}
            >
              <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>Available margin</p>
                <p className="imp colored" style={{ margin: 0, fontWeight: "600", fontSize: "1.3rem", color: "#387ed1" }}>
                  ₹{commodityFunds.availableMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>Used margin</p>
                <p className="imp" style={{ margin: 0, fontWeight: "500", fontSize: "1.1rem", color: "#333" }}>
                  ₹{commodityFunds.usedMargin.toFixed(2)}
                </p>
              </div>
              <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
                <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>Available cash</p>
                <p className="imp" style={{ margin: 0, fontWeight: "500", fontSize: "1.1rem", color: "#333" }}>
                  ₹{commodityFunds.availableCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <hr style={{ border: "none", borderTop: "1px solid #f0f0f0", margin: "14px 0" }} />
              <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between" }}>
                <p style={{ margin: 0, color: "#888", fontSize: "0.85rem" }}>Segment Status</p>
                <p style={{ margin: 0, color: "#4caf50", fontSize: "0.85rem", fontWeight: "600" }}>Ready for MCX Trading</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Funds / Withdraw Modal Popup */}
      {modalMode && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setModalMode(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "4px",
              padding: "24px",
              width: "400px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h4 style={{ margin: 0, fontWeight: "500", color: "#333" }}>
                {modalMode === "add" ? "Deposit Funds (Instant UPI)" : "Withdraw Funds"}
              </h4>
              <button
                onClick={() => setModalMode(null)}
                style={{ background: "transparent", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#666" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleTransaction}>
              {modalMode === "add" && (
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ fontSize: "0.82rem", color: "#666", display: "block", marginBottom: "6px" }}>
                    Virtual Payment Address (VPA / UPI ID)
                  </label>
                  <input
                    type="text"
                    value={upiIdInput}
                    onChange={(e) => setUpiIdInput(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "3px",
                      border: "1px solid #ddd",
                      fontSize: "0.9rem",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "0.82rem", color: "#666", display: "block", marginBottom: "6px" }}>
                  Amount (₹)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 10000"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "3px",
                    border: "1px solid #ccc",
                    fontSize: "1.1rem",
                    boxSizing: "border-box",
                    fontWeight: "600",
                    outline: "none",
                  }}
                  autoFocus
                />
              </div>

              {/* Quick Amount Pills */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "18px" }}>
                {[1000, 5000, 10000, 25000, 50000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmountInput(amt.toString())}
                    style={{
                      flex: 1,
                      padding: "6px 2px",
                      fontSize: "0.72rem",
                      border: "1px solid #e0e0e0",
                      background: "#fafafa",
                      borderRadius: "3px",
                      cursor: "pointer",
                      color: "#444",
                    }}
                  >
                    +₹{amt >= 1000 ? `${amt / 1000}k` : amt}
                  </button>
                ))}
              </div>

              {message && (
                <div
                  style={{
                    padding: "10px",
                    borderRadius: "3px",
                    fontSize: "0.82rem",
                    marginBottom: "14px",
                    background: message.includes("exceeds") || message.includes("valid") || message.includes("failed") || message.includes("error") ? "#ffebee" : "#e8f5e9",
                    color: message.includes("exceeds") || message.includes("valid") || message.includes("failed") || message.includes("error") ? "#c62828" : "#2e7d32",
                  }}
                >
                  {message}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  style={{
                    padding: "8px 16px",
                    background: "#f5f5f5",
                    border: "1px solid #ddd",
                    borderRadius: "3px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: "8px 20px",
                    background: modalMode === "add" ? "#4caf50" : "#4184f3",
                    color: "#fff",
                    border: "none",
                    borderRadius: "3px",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontWeight: "500",
                    fontSize: "0.85rem",
                  }}
                >
                  {loading ? "Processing..." : modalMode === "add" ? "Confirm & Pay via UPI" : "Confirm Withdrawal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Funds;
