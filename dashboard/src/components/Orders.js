import React, { useContext, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import GeneralContext from "./GeneralContext";

const Orders = () => {
  const { orders } = useContext(GeneralContext);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelMessage, setCancelMessage] = useState(null);

  const handleCancelOrder = async (orderId) => {
    setCancellingId(orderId);
    setCancelMessage(null);
    try {
      const res = await axios.post(`http://localhost:3001/cancelOrder/${orderId}`, {}, { withCredentials: true });
      if (res.data && res.data.success) {
        setCancelMessage({ type: "success", text: res.data.message });
      } else {
        setCancelMessage({ type: "error", text: res.data?.message || "Failed to cancel order" });
      }
    } catch (err) {
      setCancelMessage({
        type: "error",
        text: err.response?.data?.message || "Error cancelling order",
      });
    } finally {
      setCancellingId(null);
      setTimeout(() => setCancelMessage(null), 4000);
    }
  };

  const formatOrderTime = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  };

  if (!orders || orders.length === 0) {
    return (
      <div className="orders">
        <div className="no-orders">
          <p>You haven't placed any orders today</p>
          <Link to={"/"} className="btn">
            Get started
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 className="title" style={{ margin: 0 }}>
          Orders Book ({orders.length})
        </h3>
        <span style={{ fontSize: "0.8rem", color: "#888" }}>
          Live Order Execution Stream • Real-time Status Sync
        </span>
      </div>

      {cancelMessage && (
        <div
          style={{
            padding: "8px 14px",
            marginBottom: "14px",
            borderRadius: "3px",
            fontSize: "0.82rem",
            background: cancelMessage.type === "success" ? "#e8f5e9" : "#ffebee",
            color: cancelMessage.type === "success" ? "#2e7d32" : "#c62828",
            border: cancelMessage.type === "success" ? "1px solid #c8e6c9" : "1px solid #ffcdd2",
          }}
        >
          {cancelMessage.text}
        </div>
      )}

      <div className="order-table">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Instrument</th>
              <th>Product</th>
              <th>Qty.</th>
              <th>Price</th>
              <th>Status</th>
              <th>Mode</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, index) => {
              const isBuy = order.mode === "BUY";
              const isPending = order.status === "PENDING";
              const isRejected = order.status === "REJECTED";
              const isCancelled = order.status === "CANCELLED";

              let statusBg = "#e8f5e9";
              let statusColor = "#2e7d32";

              if (isPending) {
                statusBg = "#fff8e1";
                statusColor = "#f57f17";
              } else if (isRejected) {
                statusBg = "#ffebee";
                statusColor = "#c62828";
              } else if (isCancelled) {
                statusBg = "#f5f5f5";
                statusColor = "#757575";
              }

              return (
                <tr key={order._id || index}>
                  <td style={{ fontSize: "0.75rem", color: "#888" }}>{formatOrderTime(order.createdAt)}</td>
                  <td>
                    <span style={{ fontSize: "0.72rem", color: "#666" }}>
                      {order.orderType || "MARKET"}
                    </span>
                  </td>
                  <td style={{ fontWeight: "500" }}>{order.name}</td>
                  <td>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: "2px",
                        fontSize: "0.68rem",
                        fontWeight: "600",
                        background: order.product === "MIS" ? "#fff3e0" : "#e3f2fd",
                        color: order.product === "MIS" ? "#e65100" : "#1565c0",
                      }}
                    >
                      {order.product || "CNC"}
                    </span>
                  </td>
                  <td>{order.qty}</td>
                  <td>₹{Number(order.price).toFixed(2)}</td>
                  <td>
                    <span
                      title={order.rejectionReason || ""}
                      style={{
                        padding: "2px 8px",
                        borderRadius: "10px",
                        fontSize: "0.7rem",
                        fontWeight: "600",
                        background: statusBg,
                        color: statusColor,
                      }}
                    >
                      {order.status || "FILLED"}
                    </span>
                    {isRejected && order.rejectionReason && (
                      <div style={{ fontSize: "0.68rem", color: "#c62828", marginTop: "2px", maxWidth: "200px" }}>
                        {order.rejectionReason}
                      </div>
                    )}
                  </td>
                  <td className={isBuy ? "profit" : "loss"} style={{ fontWeight: "600" }}>
                    {order.mode}
                  </td>
                  <td>
                    {isPending ? (
                      <button
                        onClick={() => handleCancelOrder(order._id)}
                        disabled={cancellingId === order._id}
                        style={{
                          background: "#ffebee",
                          border: "1px solid #ffcdd2",
                          color: "#c62828",
                          padding: "3px 8px",
                          borderRadius: "3px",
                          fontSize: "0.72rem",
                          cursor: "pointer",
                          fontWeight: "500",
                        }}
                      >
                        {cancellingId === order._id ? "Cancelling..." : "Cancel"}
                      </button>
                    ) : (
                      <span style={{ color: "#bbb", fontSize: "0.75rem" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default Orders;
