import React, { useState, useEffect, useContext, useCallback } from "react";
import axios from "axios";
import { API_BASE } from "../config";
import GeneralContext from "./GeneralContext";
import {
  loadRazorpayScript,
  createPaymentOrderApi,
  verifyPaymentOrderApi,
  openRazorpayCheckout,
  fetchTransactionHistoryApi,
  checkPaymentStatusApi,
} from "../services/razorpayService";

const Funds = () => {
  const { funds, refreshData } = useContext(GeneralContext);

  const [hasCommodityAccount, setHasCommodityAccount] = useState(() => {
    return localStorage.getItem("has_commodity") === "true";
  });

  const [commodityFunds] = useState(() => {
    const saved = localStorage.getItem("user_commodity_funds");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      availableMargin: 0.0,
      usedMargin: 0.0,
      availableCash: 0.0,
      openingBalance: 0.0,
      payin: 0.0,
    };
  });

  // Modal & Payment States
  const [modalMode, setModalMode] = useState(null); // 'add' | 'withdraw' | null
  const [addMethod, setAddMethod] = useState("razorpay"); // 'razorpay' | 'upi'
  const [amountInput, setAmountInput] = useState("");
  const [upiIdInput, setUpiIdInput] = useState("user@okaxis");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info"); // 'info' | 'success' | 'error' | 'warning'
  const [paymentState, setPaymentState] = useState("idle"); // 'idle' | 'creating_order' | 'checkout_open' | 'verifying' | 'success' | 'failed' | 'pending'
  const [lastPaymentResult, setLastPaymentResult] = useState(null);
  const [activeOrderId, setActiveOrderId] = useState(null);

  // Transaction Ledger State
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionError, setTransactionError] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [filterType, setFilterType] = useState("ALL"); // 'ALL' | 'DEPOSIT' | 'WITHDRAWAL'
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalRecords: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Check if guest user without token
  const hasToken = typeof localStorage !== "undefined" && !!localStorage.getItem("token");

  useEffect(() => {
    localStorage.setItem("has_commodity", hasCommodityAccount ? "true" : "false");
  }, [hasCommodityAccount]);

  const loadTransactions = useCallback(async (currentPage = 1, currentLimit = 10, currentType = "ALL") => {
    setLoadingTransactions(true);
    setTransactionError(null);
    try {
      const typeParam = currentType === "ALL" ? null : currentType;
      const res = await fetchTransactionHistoryApi({
        page: currentPage,
        limit: currentLimit,
        type: typeParam,
      });

      if (res && res.success) {
        setTransactions(res.data || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.warn("Failed to load transactions:", err.message);
      setTransactionError(err.response?.data?.message || err.message || "Failed to load transaction history.");
      setTransactions([]);
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  useEffect(() => {
    loadTransactions(page, limit, filterType);
  }, [page, limit, filterType, loadTransactions]);

  const formatTxDateTime = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const resetModalState = useCallback(() => {
    setModalMode(null);
    setAmountInput("");
    setMessage("");
    setMessageType("info");
    setPaymentState("idle");
    setLastPaymentResult(null);
    setActiveOrderId(null);
    setLoading(false);
    loadTransactions(page, limit, filterType);
  }, [loadTransactions, page, limit, filterType]);

  const handleCheckActivePaymentStatus = async () => {
    if (!activeOrderId) return;
    setLoading(true);
    setMessage("Checking authoritative status with Razorpay...");
    setMessageType("info");

    try {
      const res = await checkPaymentStatusApi(activeOrderId);
      if (res && res.success) {
        if (res.status === "CREDITED" || res.walletCredited) {
          setPaymentState("success");
          setMessageType("success");
          setLastPaymentResult({
            paymentId: res.payment?.razorpayPaymentId || "Confirmed",
            orderId: res.payment?.razorpayOrderId || activeOrderId,
            amountRupees: res.payment?.amountRupees || Number(amountInput),
          });
          setMessage(
            `Payment confirmed and reconciled! ₹${(
              res.payment?.amountRupees || Number(amountInput)
            ).toLocaleString()} is credited to your wallet.`
          );
          refreshData();
          loadTransactions(page, limit, filterType);
        } else if (res.status === "FAILED") {
          setPaymentState("failed");
          setMessageType("error");
          setMessage(`Payment failed: ${res.message || "Declined by gateway."}`);
        } else if (res.status === "PENDING") {
          setPaymentState("pending");
          setMessageType("warning");
          setMessage(
            "Payment is authorized. Gateway capture confirmation is still pending. You may check again or refresh your balance."
          );
        } else {
          setPaymentState("idle");
          setMessageType("info");
          setMessage("Payment order is active. Awaiting payment completion.");
        }
      }
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.message || "Unable to confirm payment status at this moment.");
    } finally {
      setLoading(false);
    }
  };

  // Pre-load Razorpay checkout script on mount so it is warm and fast
  useEffect(() => {
    loadRazorpayScript().catch((err) => {
      console.warn("[Razorpay] Script pre-load warning:", err.message);
    });
  }, []);

  // -------------------------------------------------------------
  // RAZORPAY PAYMENT FLOW
  // -------------------------------------------------------------
  const handleRazorpayDeposit = async (e) => {
    if (e) e.preventDefault();
    if (loading) return; // Prevent double clicks

    const numAmount = Number(amountInput);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      setMessageType("error");
      setMessage("Please enter a valid deposit amount greater than ₹0.");
      return;
    }
    if (!Number.isInteger(numAmount)) {
      setMessageType("error");
      setMessage("Deposit amount must be a whole rupee value (e.g. ₹500, ₹5000).");
      return;
    }
    if (numAmount < 100) {
      setMessageType("error");
      setMessage("Minimum deposit amount via Razorpay is ₹100.");
      return;
    }
    if (numAmount > 100000) {
      setMessageType("error");
      setMessage("Maximum deposit limit is ₹1,00,000 per transaction.");
      return;
    }

    setLoading(true);
    setPaymentState("creating_order");
    setMessageType("info");
    setMessage("Initializing Razorpay checkout...");

    try {
      // 1. Ensure Razorpay Checkout SDK is loaded
      try {
        await loadRazorpayScript();
      } catch (scriptErr) {
        setLoading(false);
        setPaymentState("failed");
        setMessageType("error");
        setMessage("Unable to load Razorpay Checkout. Please check your internet connection.");
        return;
      }

      // 2. Generate unique idempotency key for this payment attempt
      const idempotencyKey = `idem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // 3. Create Order via Backend POST /api/payments/create-order
      setMessage("Creating payment order with gateway...");
      const orderRes = await createPaymentOrderApi({
        amount: numAmount,
        idempotencyKey,
      });

      if (!orderRes || !orderRes.orderId) {
        throw new Error(orderRes?.message || "Failed to create payment order.");
      }

      setActiveOrderId(orderRes.orderId);

      // 4. Retrieve logged-in user profile if available
      let currentUser = {};
      try {
        const savedUser = localStorage.getItem("user");
        if (savedUser) currentUser = JSON.parse(savedUser);
      } catch (e) {}

      // 5. Open Razorpay Checkout modal
      setPaymentState("checkout_open");
      setMessage("Please complete the payment in the Razorpay Checkout window.");

      openRazorpayCheckout({
        order: {
          orderId: orderRes.orderId,
          amount: orderRes.amount,
          currency: orderRes.currency,
          keyId: orderRes.keyId,
          internalPaymentId: orderRes.internalPaymentId,
        },
        user: currentUser,
        onSuccess: async (rzpResponse) => {
          // 6. Verify Payment with Backend POST /api/payments/verify
          setPaymentState("verifying");
          setMessageType("info");
          setMessage("Payment received! Verifying cryptographic signature and crediting wallet...");

          try {
            const verifyRes = await verifyPaymentOrderApi({
              razorpay_order_id: rzpResponse.razorpay_order_id,
              razorpay_payment_id: rzpResponse.razorpay_payment_id,
              razorpay_signature: rzpResponse.razorpay_signature,
            });

            if (verifyRes.success && (verifyRes.status === "CREDITED" || verifyRes.walletCredited)) {
              setPaymentState("success");
              setMessageType("success");
              setLastPaymentResult({
                paymentId: rzpResponse.razorpay_payment_id,
                orderId: rzpResponse.razorpay_order_id,
                amountRupees: numAmount,
              });
              setMessage(
                `Payment verified! ₹${numAmount.toLocaleString()} has been credited to your trading wallet.`
              );

              // Immediately refresh funds balance in global state
              refreshData();
            } else if (verifyRes.status === "PENDING") {
              setPaymentState("pending");
              setMessageType("warning");
              setMessage(
                "Payment authorized. Gateway capture is pending confirmation. Your wallet will be credited automatically once confirmed."
              );
              refreshData();
            } else {
              setPaymentState("failed");
              setMessageType("error");
              setMessage(verifyRes.message || "Payment verification could not be confirmed.");
              refreshData();
            }
          } catch (verifyErr) {
            console.error("[Razorpay Verify Error]:", verifyErr);
            const isNetworkOrTimeout =
              !verifyErr.response ||
              verifyErr.response.status === 504 ||
              verifyErr.code === "ECONNABORTED";

            if (isNetworkOrTimeout) {
              // Conclusive result was not received from network
              setPaymentState("pending");
              setMessageType("warning");
              setMessage(
                "Payment captured by Razorpay, but confirmation response was interrupted. If funds were debited, your wallet will be credited automatically via webhook momentarily. You can also refresh your balance."
              );
            } else {
              setPaymentState("failed");
              setMessageType("error");
              setMessage(
                verifyErr.response?.data?.message ||
                  "Payment verification failed. Please contact support if your account was debited."
              );
            }
            refreshData();
          } finally {
            setLoading(false);
          }
        },
        onFailure: (rzpError) => {
          setLoading(false);
          setPaymentState("failed");
          setMessageType("error");
          setMessage(
            `Payment declined: ${rzpError.description || rzpError.reason || "Transaction was not completed."}`
          );
        },
        onDismiss: () => {
          setLoading(false);
          if (paymentState !== "success" && paymentState !== "verifying") {
            setPaymentState("idle");
            setMessageType("info");
            setMessage("Checkout was closed without completing the payment.");
          }
        },
      });
    } catch (err) {
      setLoading(false);
      setPaymentState("failed");
      setMessageType("error");
      const errorText =
        err.response?.data?.message ||
        err.message ||
        "An unexpected error occurred while initiating payment.";
      setMessage(errorText);
    }
  };

  // -------------------------------------------------------------
  // SIMULATED UPI DEPOSIT FLOW (Preserved)
  // -------------------------------------------------------------
  const handleSimulatedUpiDeposit = async (e) => {
    if (e) e.preventDefault();
    const val = parseFloat(amountInput);
    if (!val || val <= 0) {
      setMessageType("error");
      setMessage("Please enter a valid amount greater than ₹0.");
      return;
    }

    setLoading(true);
    setMessageType("info");
    setMessage("Processing simulated UPI transfer...");

    try {
      const res = await axios.post(
        `${API_BASE}/api/funds/add`,
        { amount: val },
        { withCredentials: true }
      );

      if (res.data && res.data.success) {
        setMessageType("success");
        setMessage(`Successfully added ₹${val.toLocaleString()} via UPI (${upiIdInput})`);
        setTimeout(() => {
          resetModalState();
          refreshData();
        }, 1200);
      } else {
        setMessageType("error");
        setMessage(res.data?.message || "Failed to process UPI deposit.");
      }
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.message || "Transaction error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // WITHDRAWAL FLOW (Preserved)
  // -------------------------------------------------------------
  const handleWithdrawal = async (e) => {
    if (e) e.preventDefault();
    const val = parseFloat(amountInput);
    if (!val || val <= 0) {
      setMessageType("error");
      setMessage("Please enter a valid amount greater than ₹0.");
      return;
    }

    setLoading(true);
    setMessageType("info");
    setMessage("Submitting withdrawal request...");

    try {
      const res = await axios.post(
        `${API_BASE}/api/funds/withdraw`,
        { amount: val },
        { withCredentials: true }
      );

      if (res.data && res.data.success) {
        setMessageType("success");
        setMessage(`Withdrawal request for ₹${val.toLocaleString()} initiated to linked bank account`);
        setTimeout(() => {
          resetModalState();
          refreshData();
        }, 1200);
      } else {
        setMessageType("error");
        setMessage(res.data?.message || "Withdrawal failed.");
      }
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.message || "Withdrawal error. Please try again.");
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
            Instant, zero-cost fund transfers with Razorpay Gateway, UPI & Netbanking
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className="btn btn-green"
            onClick={() => {
              resetModalState();
              setModalMode("add");
              setAddMethod("razorpay");
            }}
            style={{
              border: "none",
              cursor: "pointer",
              padding: "8px 20px",
              borderRadius: "3px",
              fontWeight: "500",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>💳</span> Add funds
          </button>
          <button
            className="btn btn-blue"
            onClick={() => {
              resetModalState();
              setModalMode("withdraw");
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
            <span
              style={{
                fontSize: "0.72rem",
                background: "#e8f0fe",
                color: "#1967d2",
                padding: "2px 6px",
                borderRadius: "3px",
              }}
            >
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
                ₹{(funds.openingBalance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="data" style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <p style={{ margin: 0, color: "#888", fontSize: "0.85rem" }}>Payin (Deposits)</p>
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
              <span
                style={{
                  fontSize: "0.72rem",
                  background: "#e8f5e9",
                  color: "#2e7d32",
                  padding: "2px 6px",
                  borderRadius: "3px",
                }}
              >
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

      {/* ========================================================= */}
      {/* WALLET TRANSACTIONS & PAYMENT LEDGER                      */}
      {/* ========================================================= */}
      <div style={{ marginTop: "36px", marginBottom: "40px" }}>
        {/* Section Header with Filters and Refresh */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 4px 0", fontSize: "1.15rem", fontWeight: "600", color: "#333" }}>
              Wallet Transactions & Payment Ledger
            </h3>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#777" }}>
              Immutable records of your Razorpay deposits, UPI credits, and withdrawals
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Filter Buttons */}
            <div
              style={{
                display: "inline-flex",
                background: "#f0f2f5",
                borderRadius: "4px",
                padding: "2px",
              }}
            >
              {[
                { label: "All", value: "ALL" },
                { label: "Deposits", value: "DEPOSIT" },
                { label: "Withdrawals", value: "WITHDRAWAL" },
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => {
                    setFilterType(tab.value);
                    setPage(1);
                  }}
                  style={{
                    background: filterType === tab.value ? "#fff" : "transparent",
                    color: filterType === tab.value ? "#387ed1" : "#555",
                    fontWeight: filterType === tab.value ? "600" : "400",
                    border: "none",
                    borderRadius: "3px",
                    padding: "5px 12px",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                    boxShadow: filterType === tab.value ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => loadTransactions(page, limit, filterType)}
              disabled={loadingTransactions}
              style={{
                background: "#fff",
                border: "1px solid #dcdcdc",
                color: "#555",
                borderRadius: "4px",
                padding: "5px 10px",
                fontSize: "0.78rem",
                cursor: loadingTransactions ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
              title="Refresh ledger"
            >
              <span style={{ fontSize: "0.9rem" }}>↻</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Card Container */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "4px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            overflow: "hidden",
          }}
        >
          {loadingTransactions ? (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "#666" }}>
              <div
                style={{
                  display: "inline-block",
                  width: "24px",
                  height: "24px",
                  border: "3px solid #e5e7eb",
                  borderTopColor: "#387ed1",
                  borderRadius: "50%",
                  animation: "spin 1s infinite linear",
                  marginBottom: "10px",
                }}
              />
              <p style={{ margin: 0, fontSize: "0.85rem" }}>Loading transaction history...</p>
            </div>
          ) : transactionError ? (
            <div style={{ textAlign: "center", padding: "36px 24px", color: "#c62828" }}>
              <div style={{ fontSize: "1.6rem", marginBottom: "8px" }}>⚠️</div>
              <p style={{ margin: "0 0 12px 0", fontSize: "0.88rem", fontWeight: "500" }}>
                {transactionError}
              </p>
              <button
                onClick={() => loadTransactions(page, limit, filterType)}
                style={{
                  padding: "6px 16px",
                  background: "#387ed1",
                  color: "#fff",
                  border: "none",
                  borderRadius: "3px",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          ) : transactions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "#777" }}>
              <div style={{ fontSize: "2rem", marginBottom: "8px", color: "#9ca3af" }}>📜</div>
              <h4 style={{ margin: "0 0 4px 0", fontSize: "0.95rem", fontWeight: "500", color: "#444" }}>
                No wallet transactions found
              </h4>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#888", maxWidth: "360px", marginInline: "auto" }}>
                {filterType !== "ALL"
                  ? `No ${filterType.toLowerCase()} records match the current filter.`
                  : "Deposits via Razorpay or simulated transfers will appear here automatically."}
              </p>
            </div>
          ) : (
            <>
              {/* Responsive Table */}
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    textAlign: "left",
                    fontSize: "0.85rem",
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ padding: "12px 16px", color: "#555", fontWeight: "600", fontSize: "0.78rem" }}>
                        DATE & TIME
                      </th>
                      <th style={{ padding: "12px 16px", color: "#555", fontWeight: "600", fontSize: "0.78rem" }}>
                        TYPE
                      </th>
                      <th style={{ padding: "12px 16px", color: "#555", fontWeight: "600", fontSize: "0.78rem" }}>
                        AMOUNT
                      </th>
                      <th style={{ padding: "12px 16px", color: "#555", fontWeight: "600", fontSize: "0.78rem" }}>
                        REFERENCE / PAYMENT ID
                      </th>
                      <th style={{ padding: "12px 16px", color: "#555", fontWeight: "600", fontSize: "0.78rem" }}>
                        BALANCE AFTER
                      </th>
                      <th style={{ padding: "12px 16px", color: "#555", fontWeight: "600", fontSize: "0.78rem" }}>
                        STATUS
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, idx) => {
                      const isDeposit = tx.type === "DEPOSIT";
                      const isWithdrawal = tx.type === "WITHDRAWAL";
                      const amountFormatted = (tx.amountRupees || 0).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      });

                      return (
                        <tr
                          key={tx._id || tx.transactionId || idx}
                          style={{
                            borderBottom: "1px solid #f0f0f0",
                            transition: "background 0.15s ease",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fafafa")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
                        >
                          {/* Date & Time */}
                          <td style={{ padding: "12px 16px", color: "#666", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                            {formatTxDateTime(tx.createdAt || tx.timestamp)}
                          </td>

                          {/* Transaction Type Badge */}
                          <td style={{ padding: "12px 16px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "3px",
                                fontSize: "0.72rem",
                                fontWeight: "600",
                                background: isDeposit ? "#e8f5e9" : isWithdrawal ? "#fff3e0" : "#ede7f6",
                                color: isDeposit ? "#2e7d32" : isWithdrawal ? "#e65100" : "#512da8",
                              }}
                            >
                              {tx.type}
                            </span>
                          </td>

                          {/* Amount */}
                          <td
                            style={{
                              padding: "12px 16px",
                              fontWeight: "600",
                              fontSize: "0.9rem",
                              color: isDeposit ? "#2e7d32" : "#c62828",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isDeposit ? `+₹${amountFormatted}` : `-₹${amountFormatted}`}
                          </td>

                          {/* Reference / Method */}
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#333" }}>
                                {tx.razorpayPaymentId || tx.paymentId}
                              </span>
                              <span style={{ fontSize: "0.72rem", color: "#888" }}>
                                {tx.razorpayPaymentId
                                  ? "💳 Razorpay Gateway"
                                  : tx.paymentId?.startsWith("UPI_")
                                  ? "⚡ Simulated UPI"
                                  : tx.paymentId?.startsWith("WTH_")
                                  ? "🏦 Bank Account"
                                  : tx.description}
                              </span>
                            </div>
                          </td>

                          {/* Balance After */}
                          <td style={{ padding: "12px 16px", color: "#444", fontWeight: "500", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                            ₹{(tx.balanceAfter || 0).toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>

                          {/* Status */}
                          <td style={{ padding: "12px 16px" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 7px",
                                borderRadius: "3px",
                                fontSize: "0.72rem",
                                fontWeight: "500",
                                background:
                                  tx.status === "COMPLETED" || tx.status === "SUCCESS"
                                    ? "#f0fdf4"
                                    : tx.status === "PENDING"
                                    ? "#fffbeb"
                                    : "#fef2f2",
                                color:
                                  tx.status === "COMPLETED" || tx.status === "SUCCESS"
                                    ? "#16a34a"
                                    : tx.status === "PENDING"
                                    ? "#d97706"
                                    : "#dc2626",
                                border:
                                  tx.status === "COMPLETED" || tx.status === "SUCCESS"
                                    ? "1px solid #bbf7d0"
                                    : tx.status === "PENDING"
                                    ? "1px solid #fef3c7"
                                    : "1px solid #fecaca",
                              }}
                            >
                              <span>{tx.status === "COMPLETED" || tx.status === "SUCCESS" ? "✓" : "•"}</span>
                              <span>{tx.status}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  padding: "12px 16px",
                  borderTop: "1px solid #e5e7eb",
                  background: "#fafafa",
                  fontSize: "0.8rem",
                  color: "#666",
                  gap: "10px",
                }}
              >
                <div>
                  Showing <strong>{(pagination.page - 1) * pagination.limit + 1}</strong> to{" "}
                  <strong>
                    {Math.min(pagination.page * pagination.limit, pagination.totalRecords)}
                  </strong>{" "}
                  of <strong>{pagination.totalRecords}</strong> transactions
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {/* Rows per page selector */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>Rows:</span>
                    <select
                      value={limit}
                      onChange={(e) => {
                        setLimit(Number(e.target.value));
                        setPage(1);
                      }}
                      style={{
                        padding: "3px 6px",
                        fontSize: "0.78rem",
                        borderRadius: "3px",
                        border: "1px solid #ccc",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>

                  {/* Previous / Next buttons */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={!pagination.hasPrevPage || loadingTransactions}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "3px",
                        border: "1px solid #dcdcdc",
                        background: pagination.hasPrevPage ? "#fff" : "#f5f5f5",
                        color: pagination.hasPrevPage ? "#333" : "#aaa",
                        cursor: pagination.hasPrevPage ? "pointer" : "not-allowed",
                        fontSize: "0.78rem",
                      }}
                    >
                      ◀ Prev
                    </button>

                    <span style={{ fontSize: "0.78rem", color: "#555" }}>
                      Page {pagination.page} of {pagination.totalPages}
                    </span>

                    <button
                      onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                      disabled={!pagination.hasNextPage || loadingTransactions}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "3px",
                        border: "1px solid #dcdcdc",
                        background: pagination.hasNextPage ? "#fff" : "#f5f5f5",
                        color: pagination.hasNextPage ? "#333" : "#aaa",
                        cursor: pagination.hasNextPage ? "pointer" : "not-allowed",
                        fontSize: "0.78rem",
                      }}
                    >
                      Next ▶
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* ADD FUNDS / WITHDRAW MODAL POPUP                          */}
      {/* ========================================================= */}
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
          onClick={resetModalState}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "6px",
              padding: "24px",
              width: "440px",
              maxWidth: "92vw",
              boxSizing: "border-box",
              boxShadow: "0 10px 35px rgba(0,0,0,0.25)",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontWeight: "600", fontSize: "1.1rem", color: "#333" }}>
                  {modalMode === "add" ? "Add Funds to Account" : "Withdraw Funds"}
                </h4>
                <p style={{ margin: "2px 0 0 0", fontSize: "0.78rem", color: "#888" }}>
                  {modalMode === "add"
                    ? "Paper-trading virtual margin deposit"
                    : "Transfer available cash to linked bank account"}
                </p>
              </div>
              <button
                onClick={resetModalState}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.3rem",
                  cursor: "pointer",
                  color: "#999",
                  padding: "4px",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Guest notice if unauthenticated */}
            {!hasToken && modalMode === "add" && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "4px",
                  background: "#fff9e6",
                  border: "1px solid #ffe8b3",
                  fontSize: "0.78rem",
                  color: "#7d5200",
                  marginBottom: "14px",
                }}
              >
                ⚠️ <strong>Guest Session:</strong> Razorpay Gateway requires a registered user session.
                Please sign in, or use <strong>Simulated UPI</strong> for trial paper trading.
              </div>
            )}

            {/* Payment Method Selector for 'add' mode */}
            {modalMode === "add" && (
              <div
                style={{
                  display: "flex",
                  borderBottom: "1px solid #eee",
                  marginBottom: "18px",
                  gap: "12px",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setAddMethod("razorpay");
                    setMessage("");
                    setMessageType("info");
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 4px",
                    background: "none",
                    border: "none",
                    borderBottom: addMethod === "razorpay" ? "2px solid #387ed1" : "2px solid transparent",
                    color: addMethod === "razorpay" ? "#387ed1" : "#666",
                    fontWeight: addMethod === "razorpay" ? "600" : "400",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  💳 Razorpay Gateway
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddMethod("upi");
                    setMessage("");
                    setMessageType("info");
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 4px",
                    background: "none",
                    border: "none",
                    borderBottom: addMethod === "upi" ? "2px solid #387ed1" : "2px solid transparent",
                    color: addMethod === "upi" ? "#387ed1" : "#666",
                    fontWeight: addMethod === "upi" ? "600" : "400",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  ⚡ Simulated UPI (Sandbox)
                </button>
              </div>
            )}

            {/* SUCCESS STATE DISPLAY */}
            {paymentState === "success" && lastPaymentResult ? (
              <div style={{ textAlign: "center", padding: "16px 8px" }}>
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    background: "#e8f5e9",
                    color: "#2e7d32",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.8rem",
                    margin: "0 auto 12px auto",
                  }}
                >
                  ✓
                </div>
                <h4 style={{ margin: "0 0 6px 0", color: "#2e7d32", fontWeight: "600" }}>
                  Funds Credited Successfully!
                </h4>
                <p style={{ margin: "0 0 16px 0", fontSize: "0.9rem", color: "#555" }}>
                  <strong>₹{lastPaymentResult.amountRupees.toLocaleString()}</strong> has been added to your available margin.
                </p>

                <div
                  style={{
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    borderRadius: "4px",
                    padding: "10px 14px",
                    fontSize: "0.78rem",
                    color: "#666",
                    textAlign: "left",
                    marginBottom: "20px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span>Payment ID:</span>
                    <span style={{ fontFamily: "monospace", color: "#333" }}>{lastPaymentResult.paymentId}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Order ID:</span>
                    <span style={{ fontFamily: "monospace", color: "#333" }}>{lastPaymentResult.orderId}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetModalState}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "#387ed1",
                    color: "#fff",
                    border: "none",
                    borderRadius: "3px",
                    fontWeight: "500",
                    fontSize: "0.9rem",
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              /* FORM ENTRY STATE */
              <form
                onSubmit={
                  modalMode === "withdraw"
                    ? handleWithdrawal
                    : addMethod === "razorpay"
                    ? handleRazorpayDeposit
                    : handleSimulatedUpiDeposit
                }
              >
                {/* Method-specific sub-info */}
                {modalMode === "add" && addMethod === "razorpay" && (
                  <div
                    style={{
                      background: "#f0f7ff",
                      border: "1px solid #cce5ff",
                      borderRadius: "4px",
                      padding: "8px 12px",
                      fontSize: "0.78rem",
                      color: "#004085",
                      marginBottom: "14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Razorpay Test Mode • UPI, Cards, Netbanking</span>
                    <span style={{ fontWeight: "600", fontSize: "0.72rem", background: "#387ed1", color: "#fff", padding: "1px 6px", borderRadius: "3px" }}>
                      TEST
                    </span>
                  </div>
                )}

                {/* UPI ID input for Simulated UPI only */}
                {modalMode === "add" && addMethod === "upi" && (
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

                {/* Amount input */}
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label style={{ fontSize: "0.82rem", color: "#666", margin: 0 }}>
                      Deposit Amount (₹)
                    </label>
                    {modalMode === "add" && addMethod === "razorpay" && (
                      <span style={{ fontSize: "0.72rem", color: "#888" }}>
                        Min ₹100 • Max ₹1,00,000
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "3px",
                      border: "1px solid #ccc",
                      fontSize: "1.15rem",
                      boxSizing: "border-box",
                      fontWeight: "600",
                      outline: "none",
                    }}
                    autoFocus
                  />
                </div>

                {/* Quick Amount Pills */}
                <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
                  {[500, 1000, 5000, 10000, 25000, 50000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      disabled={loading}
                      onClick={() => setAmountInput(amt.toString())}
                      style={{
                        flex: "1 0 28%",
                        padding: "6px 4px",
                        fontSize: "0.75rem",
                        border: "1px solid #e0e0e0",
                        background: "#fafafa",
                        borderRadius: "3px",
                        cursor: loading ? "not-allowed" : "pointer",
                        color: "#444",
                        fontWeight: "500",
                      }}
                    >
                      +₹{amt >= 1000 ? `${amt / 1000}k` : amt}
                    </button>
                  ))}
                </div>

                {/* Notification / Status Message Box */}
                {message && (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "4px",
                      fontSize: "0.82rem",
                      marginBottom: "14px",
                      lineHeight: "1.4",
                      background:
                        messageType === "error"
                          ? "#ffebee"
                          : messageType === "success"
                          ? "#e8f5e9"
                          : messageType === "warning"
                          ? "#fff9e6"
                          : "#f0f7ff",
                      color:
                        messageType === "error"
                          ? "#c62828"
                          : messageType === "success"
                          ? "#2e7d32"
                          : messageType === "warning"
                          ? "#856404"
                          : "#004085",
                      border:
                        messageType === "error"
                          ? "1px solid #ffcdd2"
                          : messageType === "success"
                          ? "1px solid #c8e6c9"
                          : messageType === "warning"
                          ? "1px solid #ffeeba"
                          : "1px solid #b8daff",
                    }}
                  >
                    {message}
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={resetModalState}
                    disabled={loading && paymentState === "verifying"}
                    style={{
                      padding: "8px 16px",
                      background: "#f5f5f5",
                      border: "1px solid #ddd",
                      borderRadius: "3px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      color: "#444",
                    }}
                  >
                    Cancel
                  </button>

                  {activeOrderId && (paymentState === "pending" || paymentState === "failed") && (
                    <button
                      type="button"
                      onClick={handleCheckActivePaymentStatus}
                      disabled={loading}
                      style={{
                        padding: "8px 14px",
                        background: "#fff",
                        border: "1px solid #387ed1",
                        color: "#387ed1",
                        borderRadius: "3px",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontWeight: "500",
                        fontSize: "0.82rem",
                      }}
                    >
                      Check Status
                    </button>
                  )}

                  {paymentState === "pending" ? (
                    <button
                      type="button"
                      onClick={() => {
                        refreshData();
                        loadTransactions(page, limit, filterType);
                        resetModalState();
                      }}
                      style={{
                        padding: "8px 18px",
                        background: "#387ed1",
                        color: "#fff",
                        border: "none",
                        borderRadius: "3px",
                        cursor: "pointer",
                        fontWeight: "500",
                        fontSize: "0.85rem",
                      }}
                    >
                      Refresh Balance
                    </button>
                  ) : paymentState === "failed" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentState("idle");
                        setMessage("");
                        setActiveOrderId(null);
                      }}
                      style={{
                        padding: "8px 18px",
                        background: "#387ed1",
                        color: "#fff",
                        border: "none",
                        borderRadius: "3px",
                        cursor: "pointer",
                        fontWeight: "500",
                        fontSize: "0.85rem",
                      }}
                    >
                      Try Again
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={loading}
                      style={{
                        padding: "8px 20px",
                        background:
                          modalMode === "withdraw"
                            ? "#4184f3"
                            : addMethod === "razorpay"
                            ? "#387ed1"
                            : "#4caf50",
                        color: "#fff",
                        border: "none",
                        borderRadius: "3px",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontWeight: "500",
                        fontSize: "0.85rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {loading ? (
                        <>
                          <span
                            style={{
                              display: "inline-block",
                              width: "12px",
                              height: "12px",
                              border: "2px solid #ffffff88",
                              borderTopColor: "#fff",
                              borderRadius: "50%",
                              animation: "spin 1s infinite linear",
                            }}
                          />
                          <span>
                            {paymentState === "verifying"
                              ? "Verifying Payment..."
                              : paymentState === "creating_order"
                              ? "Creating Order..."
                              : "Processing..."}
                          </span>
                        </>
                      ) : modalMode === "withdraw" ? (
                        "Confirm Withdrawal"
                      ) : addMethod === "razorpay" ? (
                        "Proceed to Pay via Razorpay"
                      ) : (
                        "Confirm & Pay via UPI"
                      )}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Inline Keyframe for Spinner */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Funds;
