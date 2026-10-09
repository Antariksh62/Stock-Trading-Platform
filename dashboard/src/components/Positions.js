import React, { useContext } from "react";
import GeneralContext from "./GeneralContext";

const Positions = () => {
  const { positions: allPositions } = useContext(GeneralContext);

  let totalPnL = 0;

  (allPositions || []).forEach((pos) => {
    const qty = Number(pos.qty) || 0;
    const avg = Number(pos.avg) || 0;
    const price = Number(pos.price) || 0;
    const pnl = (price - avg) * qty;
    totalPnL += pnl;
  });

  const isTotalProfit = totalPnL >= 0;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 className="title" style={{ margin: 0 }}>
          Positions ({allPositions.length})
        </h3>
        <span style={{ fontSize: "0.8rem", color: "#888" }}>
          Intraday & F&O Open Positions • Real-time Mark to Market (MTM)
        </span>
      </div>

      <div className="order-table">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Instrument</th>
              <th>Qty.</th>
              <th>Avg.</th>
              <th>LTP</th>
              <th>P&L</th>
              <th>Chg.</th>
            </tr>
          </thead>
          <tbody>
            {(allPositions || []).map((stock, index) => {
              const qty = Number(stock.qty) || 0;
              const avg = Number(stock.avg) || 0;
              const price = Number(stock.price) || 0;
              const currValue = price * qty;
              const pnl = currValue - avg * qty;
              const isProfit = pnl >= 0.0;
              const profClass = isProfit ? "profit" : "loss";
              const dayClass = stock.isLoss ? "loss" : "profit";

              return (
                <tr key={stock._id || index}>
                  <td>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: "2px",
                        fontSize: "0.68rem",
                        fontWeight: "600",
                        background: stock.product === "MIS" ? "#fff3e0" : "#e8f5e9",
                        color: stock.product === "MIS" ? "#e65100" : "#2e7d32",
                        border: stock.product === "MIS" ? "1px solid #ffe0b2" : "1px solid #c8e6c9",
                      }}
                    >
                      {stock.product || "MIS"}
                    </span>
                  </td>
                  <td style={{ fontWeight: "500" }}>{stock.name}</td>
                  <td>{qty}</td>
                  <td>{avg.toFixed(2)}</td>
                  <td>{price.toFixed(2)}</td>
                  <td className={profClass} style={{ fontWeight: "600" }}>
                    {isProfit ? "+" : ""}
                    {pnl.toFixed(2)}
                  </td>
                  <td className={dayClass}>{stock.day || "+0.00%"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Position Summary Bar */}
      <div className="row" style={{ marginTop: "30px", borderTop: "1px solid #f0f0f0", paddingTop: "20px" }}>
        <div className="col">
          <h5>{allPositions.length}</h5>
          <p>Total Open Positions</p>
        </div>
        <div className="col">
          <h5 style={{ color: isTotalProfit ? "#4caf50" : "#df4949" }}>
            {isTotalProfit ? "+" : ""}₹{totalPnL.toFixed(2)}
          </h5>
          <p>Total MTM / Day's P&L</p>
        </div>
        <div className="col">
          <h5 style={{ color: "#387ed1" }}>Zero Brokerage</h5>
          <p>Equity Intraday @ Flat ₹20/trade</p>
        </div>
      </div>
    </>
  );
};

export default Positions;
