import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const Orders = () => {
  const [allOrders, setAllOrders] = useState([]);

  useEffect(() => {
    axios
      .get("http://localhost:3001/allOrders")
      .then((res) => {
        setAllOrders(res.data || []);
      })
      .catch((err) => {
        console.error("Error fetching orders:", err);
      });
  }, []);

  if (allOrders.length === 0) {
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
      <h3 className="title">Orders ({allOrders.length})</h3>

      <div className="order-table">
        <table>
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Qty.</th>
              <th>Price</th>
              <th>Mode</th>
            </tr>
          </thead>
          <tbody>
            {allOrders.map((order, index) => {
              const isBuy = order.mode === "BUY";
              return (
                <tr key={order._id || index}>
                  <td>{order.name}</td>
                  <td>{order.qty}</td>
                  <td>{Number(order.price).toFixed(2)}</td>
                  <td className={isBuy ? "profit" : "loss"}>{order.mode}</td>
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
