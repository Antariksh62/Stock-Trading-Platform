import React, { useContext } from "react";
import { VerticalGraph } from "./VerticalGraph";
import GeneralContext from "./GeneralContext";

const Holdings = () => {
  const { holdings: allHoldings, openAIAnalystWindow } = useContext(GeneralContext);

  let totalInvestment = 0;
  let totalCurrentValue = 0;

  (allHoldings || []).forEach((stock) => {
    const qty = Number(stock.qty) || 0;
    const avg = Number(stock.avg) || 0;
    const price = Number(stock.price) || 0;
    totalInvestment += avg * qty;
    totalCurrentValue += price * qty;
  });

  const totalPnL = totalCurrentValue - totalInvestment;
  const pnlPercent = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;
  const isProfit = totalPnL >= 0;

  const labels = (allHoldings || []).map((subArray) => subArray["name"]);

  const data = {
    labels,
    datasets: [
      {
        label: "Stock Price",
        data: (allHoldings || []).map((stock) => stock.price),
        backgroundColor: "rgba(56, 126, 209, 0.5)",
      },
    ],
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 className="title" style={{ margin: 0 }}>
          Holdings ({allHoldings.length})
        </h3>
        <button
          onClick={openAIAnalystWindow}
          style={{
            background: "linear-gradient(135deg, #387ed1, #7c4dff)",
            color: "#fff",
            border: "none",
            padding: "6px 14px",
            borderRadius: "4px",
            fontSize: "0.8rem",
            fontWeight: "500",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 2px 5px rgba(56, 126, 209, 0.2)",
          }}
        >
          <span>✦</span>
          <span>Analyze Portfolio with Gemini AI</span>
        </button>
      </div>

      <div className="order-table">
        <table>
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Qty.</th>
              <th>Avg. cost</th>
              <th>LTP</th>
              <th>Cur. val</th>
              <th>P&L</th>
              <th>Net chg.</th>
              <th>Day chg.</th>
            </tr>
          </thead>

          <tbody>
            {(allHoldings || []).map((stock, index) => {
              const qty = Number(stock.qty) || 0;
              const avg = Number(stock.avg) || 0;
              const price = Number(stock.price) || 0;
              const currValue = price * qty;
              const pnl = currValue - avg * qty;
              const isItemProfit = pnl >= 0.0;
              const profClass = isItemProfit ? "profit" : "loss";

              const isDayLoss = typeof stock.day === "string" && stock.day.startsWith("-");
              const dayClass = isDayLoss ? "loss" : "profit";

              return (
                <tr key={stock._id || index}>
                  <td style={{ fontWeight: "500" }}>{stock.name}</td>
                  <td>{qty}</td>
                  <td>{avg.toFixed(2)}</td>
                  <td>{price.toFixed(2)}</td>
                  <td>{currValue.toFixed(2)}</td>
                  <td className={profClass} style={{ fontWeight: "600" }}>
                    {isItemProfit ? "+" : ""}
                    {pnl.toFixed(2)}
                  </td>
                  <td className={profClass}>{stock.net || "+0.00%"}</td>
                  <td className={dayClass}>{stock.day || "+0.00%"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: "24px" }}>
        <div className="col">
          <h5>
            ₹{totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h5>
          <p>Total investment</p>
        </div>
        <div className="col">
          <h5>
            ₹{totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h5>
          <p>Current value</p>
        </div>
        <div className="col">
          <h5 className={isProfit ? "profit" : "loss"}>
            {isProfit ? "+" : ""}₹{totalPnL.toFixed(2)} ({isProfit ? "+" : ""}{pnlPercent.toFixed(2)}%)
          </h5>
          <p>Total Portfolio P&L</p>
        </div>
      </div>

      {allHoldings.length > 0 && <VerticalGraph data={data} />}
    </>
  );
};

export default Holdings;