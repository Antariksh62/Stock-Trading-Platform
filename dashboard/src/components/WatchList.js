import React, { useState, useEffect, useContext } from "react";
import { Tooltip, Grow } from '@mui/material';
import { watchList as defaultNiftyList } from "../data/data";
import { KeyboardArrowUp, KeyboardArrowDown, BarChartOutlined, MoreHoriz } from '@mui/icons-material';
import GeneralContext from "./GeneralContext";
import { DoughnutChart } from "./DoughnutChart";
import axios from "axios";

const API_KEY = "e3a7567d8f13431faf3c7e751e797817";

const nasdaqDefaultList = [
  { name: "AAPL", price: 228.45, percent: "+1.49%", isDown: false, market: "NASDAQ" },
  { name: "NVDA", price: 135.20, percent: "+3.36%", isDown: false, market: "NASDAQ" },
  { name: "TSLA", price: 242.80, percent: "-1.74%", isDown: true, market: "NASDAQ" },
  { name: "MSFT", price: 418.90, percent: "+0.87%", isDown: false, market: "NASDAQ" },
  { name: "GOOGL", price: 166.40, percent: "+1.34%", isDown: false, market: "NASDAQ" },
  { name: "AMZN", price: 187.60, percent: "+0.91%", isDown: false, market: "NASDAQ" },
  { name: "META", price: 585.30, percent: "+2.10%", isDown: false, market: "NASDAQ" },
  { name: "NFLX", price: 712.40, percent: "-0.62%", isDown: true, market: "NASDAQ" },
];

const WatchList = () => {
  const [marketTab, setMarketTab] = useState("NIFTY"); // "NIFTY" | "NASDAQ"
  const [nasdaqStocks, setNasdaqStocks] = useState(nasdaqDefaultList);
  const [searchTerm, setSearchTerm] = useState("");

  const currentList = marketTab === "NIFTY" ? defaultNiftyList : nasdaqStocks;

  // Real-time Twelve Data fetch for live prices
  useEffect(() => {
    let isMounted = true;

    const fetchLiveUSQuotes = async () => {
      try {
        const symbols = "AAPL,NVDA,TSLA,MSFT,GOOGL,AMZN,META,NFLX";
        const res = await axios.get(
          `https://api.twelvedata.com/quote?symbol=${symbols}&apikey=${API_KEY}`,
          { timeout: 8000 }
        );

        if (isMounted && res.data) {
          setNasdaqStocks((prev) =>
            prev.map((stock) => {
              const quote = res.data[stock.name];
              if (quote && quote.close) {
                const price = parseFloat(quote.close);
                const pct = parseFloat(quote.percent_change || 0);
                return {
                  ...stock,
                  price: price,
                  percent: (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%",
                  isDown: pct < 0,
                };
              }
              return stock;
            })
          );
        }
      } catch (err) {
        // Silent fallback to default/simulated tick
      }
    };

    fetchLiveUSQuotes();
    const interval = setInterval(fetchLiveUSQuotes, 25000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const filteredList = currentList.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const labels = filteredList.slice(0, 10).map((subArray) => subArray["name"]);

  const data = {
    labels,
    datasets: [
      {
        label: "Price",
        data: filteredList.slice(0, 10).map((stock) => stock.price),
        backgroundColor: [
          "rgba(255, 99, 132, 0.5)",
          "rgba(54, 162, 235, 0.5)",
          "rgba(255, 206, 86, 0.5)",
          "rgba(75, 192, 192, 0.5)",
          "rgba(153, 102, 255, 0.5)",
          "rgba(255, 159, 64, 0.5)",
          "rgba(65, 132, 243, 0.5)",
          "rgba(76, 175, 80, 0.5)",
          "rgba(255, 87, 34, 0.5)",
          "rgba(156, 39, 176, 0.5)",
        ],
        borderColor: [
          "rgba(255, 99, 132, 1)",
          "rgba(54, 162, 235, 1)",
          "rgba(255, 206, 86, 1)",
          "rgba(75, 192, 192, 1)",
          "rgba(153, 102, 255, 1)",
          "rgba(255, 159, 64, 1)",
          "rgba(65, 132, 243, 1)",
          "rgba(76, 175, 80, 1)",
          "rgba(255, 87, 34, 1)",
          "rgba(156, 39, 176, 1)",
        ],
        borderWidth: 1,
      },
    ],
  };

  return (
    <div className="watchlist-container">
      {/* Market Selector & Search */}
      <div style={{ display: "flex", borderBottom: "1px solid #eee", padding: "6px 12px", background: "#fafafa" }}>
        <button
          onClick={() => setMarketTab("NIFTY")}
          style={{
            border: "none",
            background: marketTab === "NIFTY" ? "#fff" : "transparent",
            color: marketTab === "NIFTY" ? "#387ed1" : "#666",
            fontWeight: marketTab === "NIFTY" ? "600" : "400",
            padding: "4px 12px",
            fontSize: "0.78rem",
            cursor: "pointer",
            borderRadius: "3px",
            boxShadow: marketTab === "NIFTY" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            marginRight: "6px",
          }}
        >
          Nifty 50 (NSE)
        </button>
        <button
          onClick={() => setMarketTab("NASDAQ")}
          style={{
            border: "none",
            background: marketTab === "NASDAQ" ? "#fff" : "transparent",
            color: marketTab === "NASDAQ" ? "#387ed1" : "#666",
            fontWeight: marketTab === "NASDAQ" ? "600" : "400",
            padding: "4px 12px",
            fontSize: "0.78rem",
            cursor: "pointer",
            borderRadius: "3px",
            boxShadow: marketTab === "NASDAQ" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}
        >
          Nasdaq 100 (US)
        </button>
      </div>

      <div className="search-container">
        <input
          type="text"
          name="search"
          id="search"
          placeholder="Search eg:infy, bse, nifty fut weekly, gold mcx"
          className="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <span className="counts">{filteredList.length} / 50</span>
      </div>

      <ul className="list">
        {filteredList.map((stock, index) => {
          return (
            <WatchListItem stock={stock} key={stock.name || index}></WatchListItem>
          );
        })}
      </ul>

      <div style={{ padding: "10px" }}>
        <DoughnutChart data={data} />
      </div>
    </div>
  );
};

export default WatchList;

const WatchListItem = ({ stock }) => {
  const [showWatchListActions, setShowWatchListActions] = useState(false);

  const handleMouseEnter = () => {
    setShowWatchListActions(true);
  };

  const handleMouseLeave = () => {
    setShowWatchListActions(false);
  };

  return (
    <li onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div className="item">
        <p className={stock.isDown ? "down" : "up"}>{stock.name}</p>
        <div className="itemInfo">
          <span style={{ fontSize: "0.78rem", color: "#666", marginRight: "6px" }}>
            {stock.price ? stock.price.toFixed(2) : ""}
          </span>
          <span className="percent">{stock.percent}</span>
          {stock.isDown ? (
            <KeyboardArrowDown className="down" />
          ) : (
            <KeyboardArrowUp className="up" />
          )}
        </div>
      </div>
      {showWatchListActions && <WatchListActions stock={stock}></WatchListActions>}
    </li>
  );
};

const WatchListActions = ({ stock }) => {
  const generalContext = useContext(GeneralContext);
  const uid = stock?.name || "";

  const handleBuyClick = () => {
    generalContext.openBuyWindow(uid, "BUY");
  };

  const handleSellClick = () => {
    generalContext.openBuyWindow(uid, "SELL");
  };

  const handleAnalyticsClick = () => {
    generalContext.openAnalyticsWindow(uid, stock);
  };

  return (
    <span className="actions">
      <span>
        <Tooltip
          title="Buy (B)"
          placement="top"
          arrow
          TransitionComponent={Grow}
        >
          <button className="buy" onClick={handleBuyClick}>Buy</button>
        </Tooltip>

        <Tooltip
          title="Sell (S)"
          placement="top"
          arrow
          TransitionComponent={Grow}
        >
          <button className="sell" onClick={handleSellClick}>Sell</button>
        </Tooltip>

        <Tooltip
          title="Analytics (A)"
          placement="top"
          arrow
          TransitionComponent={Grow}
        >
          <button className="action" onClick={handleAnalyticsClick}>
            <BarChartOutlined className="icon" />
          </button>
        </Tooltip>

        <Tooltip
          title="More"
          placement="top"
          arrow
          TransitionComponent={Grow}
        >
          <button className="action" onClick={handleAnalyticsClick}>
            <MoreHoriz className="icon" />
          </button>
        </Tooltip>
      </span>
    </span>
  );
};