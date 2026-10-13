import React, { useState, useEffect, useContext, useMemo, useRef } from "react";
import { Tooltip, Grow } from "@mui/material";
import { KeyboardArrowUp, KeyboardArrowDown, BarChartOutlined, MoreHoriz, ChevronLeft, ChevronRight } from "@mui/icons-material";
import GeneralContext from "./GeneralContext";
import { DoughnutChart } from "./DoughnutChart";
import { nifty50Stocks, nasdaq100Stocks } from "../data/stocksData";
import axios from "axios";

const PAGE_SIZE = 10;

const WatchList = () => {
  const [marketTab, setMarketTab] = useState("NIFTY"); // "NIFTY" | "NASDAQ"
  const [niftyStocks, setNiftyStocks] = useState(nifty50Stocks);
  const [nasdaqStocks, setNasdaqStocks] = useState(nasdaq100Stocks);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rateLimitExhausted, setRateLimitExhausted] = useState(false);
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);

  const listTopRef = useRef(null);

  // Active dataset depending on selected tab
  const activeList = marketTab === "NIFTY" ? niftyStocks : nasdaqStocks;
  const maxQuotaCount = marketTab === "NIFTY" ? 50 : 100;

  // Filter based on search input
  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return activeList;
    const lower = searchTerm.toLowerCase();
    return activeList.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        (s.fullName && s.fullName.toLowerCase().includes(lower))
    );
  }, [activeList, searchTerm]);

  // Reset to page 1 whenever tab or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [marketTab, searchTerm]);

  // Compute pagination
  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const visibleStocks = filteredList.slice(startIndex, startIndex + PAGE_SIZE);

  // Poll live quotes strictly for the currently visible 10 stocks (saves API credits)
  useEffect(() => {
    let isMounted = true;

    const fetchCurrentPageQuotes = async () => {
      if (visibleStocks.length === 0) return;
      const symbols = visibleStocks.map((s) => s.name).join(",");

      try {
        setIsLiveUpdating(true);
        const res = await axios.get(`http://localhost:3001/api/quotes?symbols=${symbols}`, {
          timeout: 7000,
        });

        if (!isMounted) return;

        if (res.data) {
          setRateLimitExhausted(Boolean(res.data.rateLimitExhausted));

          const quotes = res.data.quotes || {};
          const updateFn = (prevList) =>
            prevList.map((stock) => {
              const q = quotes[stock.name];
              if (q && q.price) {
                return {
                  ...stock,
                  price: q.price,
                  percent: q.percent,
                  isDown: q.isDown,
                };
              }
              return stock;
            });

          if (marketTab === "NIFTY") {
            setNiftyStocks(updateFn);
          } else {
            setNasdaqStocks(updateFn);
          }
        }
      } catch (err) {
        console.warn("[WatchList Quotes] Fallback to cached baseline:", err.message);
      } finally {
        if (isMounted) setIsLiveUpdating(false);
      }
    };

    fetchCurrentPageQuotes();
    const timer = setInterval(fetchCurrentPageQuotes, 30000); // 30s interval = 2 calls/min (safe for 8 credits/min)

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketTab, currentPage, visibleStocks.length]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      if (listTopRef.current) {
        listTopRef.current.scrollTop = 0;
      }
    }
  };

  // Doughnut chart labels & values from current visible page
  const chartLabels = visibleStocks.map((s) => s.name);
  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: "Price",
        data: visibleStocks.map((s) => s.price),
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
    <div className="watchlist-container" ref={listTopRef}>
      {/* 1. Market Tabs Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #eee",
          padding: "8px 12px",
          background: "#fafafa",
        }}
      >
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={() => setMarketTab("NIFTY")}
            style={{
              border: "none",
              background: marketTab === "NIFTY" ? "#fff" : "transparent",
              color: marketTab === "NIFTY" ? "#387ed1" : "#666",
              fontWeight: marketTab === "NIFTY" ? "600" : "400",
              padding: "5px 12px",
              fontSize: "0.78rem",
              cursor: "pointer",
              borderRadius: "4px",
              boxShadow: marketTab === "NIFTY" ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
              transition: "all 0.2s ease",
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
              padding: "5px 12px",
              fontSize: "0.78rem",
              cursor: "pointer",
              borderRadius: "4px",
              boxShadow: marketTab === "NASDAQ" ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
              transition: "all 0.2s ease",
            }}
          >
            Nasdaq 100 (US)
          </button>
        </div>

        {/* Live Indicator */}
        <span
          title={rateLimitExhausted ? "Twelve Data daily quota reached. Serving resilient cached baseline." : "Quotes update in batches safely"}
          style={{
            fontSize: "0.68rem",
            color: rateLimitExhausted ? "#8d6e63" : isLiveUpdating ? "#387ed1" : "#4caf50",
            fontWeight: "500",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span style={{ fontSize: "0.5rem", color: rateLimitExhausted ? "#ff9800" : isLiveUpdating ? "#387ed1" : "#4caf50" }}>●</span>
          {rateLimitExhausted ? "Cached Feed" : isLiveUpdating ? "Syncing" : "Live"}
        </span>
      </div>

      {/* 3. Search Bar with Dynamic Count Badge */}
      <div className="search-container">
        <input
          type="text"
          name="search"
          id="search"
          placeholder={marketTab === "NIFTY" ? "Search Nifty 50 stocks (e.g. RELIANCE, TCS)..." : "Search Nasdaq 100 stocks (e.g. AAPL, NVDA)..."}
          className="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {/* Dynamic counter: shows filteredList.length / 50 (Nifty) or / 100 (Nasdaq) */}
        <span className="counts">
          {filteredList.length} / {maxQuotaCount}
        </span>
      </div>

      {/* 4. Active Stock List (Paginated by 10) */}
      <ul className="list" style={{ paddingBottom: "10px" }}>
        {visibleStocks.length > 0 ? (
          visibleStocks.map((stock, index) => (
            <WatchListItem stock={stock} key={stock.name || index} />
          ))
        ) : (
          <li style={{ textAlign: "center", color: "#888", padding: "30px 10px", fontSize: "0.85rem" }}>
            No stocks matched "{searchTerm}"
          </li>
        )}
      </ul>

      {/* 5. Zerodha Kite Style Watchlist Pagination Bar */}
      <div
        style={{
          borderTop: "1px solid #f0f0f0",
          borderBottom: "1px solid #f0f0f0",
          background: "#fafafa",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.75rem",
          color: "#666",
        }}
      >
        <span>
          Showing {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, filteredList.length)} of {filteredList.length}
        </span>

        {/* Page navigation buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            style={{
              border: "1px solid #e0e0e0",
              background: "#fff",
              borderRadius: "3px",
              padding: "2px 6px",
              cursor: currentPage === 1 ? "not-allowed" : "pointer",
              opacity: currentPage === 1 ? 0.4 : 1,
              display: "flex",
              alignItems: "center",
            }}
            title="Previous Page"
          >
            <ChevronLeft style={{ fontSize: "1rem" }} />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
            <button
              key={pageNum}
              onClick={() => handlePageChange(pageNum)}
              style={{
                border: "none",
                background: currentPage === pageNum ? "#387ed1" : "transparent",
                color: currentPage === pageNum ? "#fff" : "#555",
                fontWeight: currentPage === pageNum ? "600" : "400",
                width: "24px",
                height: "24px",
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "0.72rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {pageNum}
            </button>
          ))}

          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            style={{
              border: "1px solid #e0e0e0",
              background: "#fff",
              borderRadius: "3px",
              padding: "2px 6px",
              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
              opacity: currentPage === totalPages ? 0.4 : 1,
              display: "flex",
              alignItems: "center",
            }}
            title="Next Page"
          >
            <ChevronRight style={{ fontSize: "1rem" }} />
          </button>
        </div>
      </div>

      {/* 6. Doughnut Chart for Page Holdings */}
      <div style={{ padding: "16px 10px 40px 10px" }}>
        <DoughnutChart data={chartData} />
      </div>
    </div>
  );
};

export default WatchList;

const WatchListItem = ({ stock }) => {
  const [showWatchListActions, setShowWatchListActions] = useState(false);

  const handleMouseEnter = () => setShowWatchListActions(true);
  const handleMouseLeave = () => setShowWatchListActions(false);

  return (
    <li
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "relative",
        background: showWatchListActions ? "#fbfbfb" : "transparent",
        transition: "background 0.15s ease",
      }}
    >
      <div className="item" style={{ minHeight: "38px" }}>
        {/* Left: Stock Symbol & Company Name */}
        <div style={{ maxWidth: showWatchListActions ? "40%" : "60%", overflow: "hidden" }}>
          <p className={stock.isDown ? "down" : "up"} style={{ margin: 0, fontWeight: "500" }}>
            {stock.name}
          </p>
          {stock.fullName && (
            <span
              style={{
                fontSize: "0.65rem",
                color: "#9e9e9e",
                display: "block",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
              }}
            >
              {stock.fullName}
            </span>
          )}
        </div>

        {/* Right: Toggle cleanly between Actions (on hover) and Price (default) */}
        {showWatchListActions ? (
          <div style={{ display: "flex", alignItems: "center", animation: "fadeIn 0.15s ease" }}>
            <WatchListActions stock={stock} />
          </div>
        ) : (
          <div className="itemInfo" style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", color: "#333", fontWeight: "500", marginRight: "6px" }}>
              {stock.market === "NASDAQ" ? "$" : "₹"}
              {typeof stock.price === "number" ? stock.price.toFixed(2) : stock.price}
            </span>
            <span className="percent" style={{ fontSize: "0.75rem" }}>
              {stock.percent}
            </span>
            {stock.isDown ? (
              <KeyboardArrowDown className="down" style={{ fontSize: "1rem" }} />
            ) : (
              <KeyboardArrowUp className="up" style={{ fontSize: "1rem" }} />
            )}
          </div>
        )}
      </div>
    </li>
  );
};

const WatchListActions = ({ stock }) => {
  const generalContext = useContext(GeneralContext);
  const uid = stock?.name || "";

  const handleBuyClick = (e) => {
    e.stopPropagation();
    generalContext.openBuyWindow(uid, "BUY", stock?.price);
  };

  const handleSellClick = (e) => {
    e.stopPropagation();
    generalContext.openBuyWindow(uid, "SELL", stock?.price);
  };

  const handleAnalyticsClick = (e) => {
    e.stopPropagation();
    generalContext.openAnalyticsWindow(uid, stock);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <Tooltip title="Buy (B)" placement="top" arrow TransitionComponent={Grow}>
        <button
          className="buy"
          onClick={handleBuyClick}
          style={{
            background: "#4184f3",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            padding: "4px 10px",
            fontSize: "0.75rem",
            fontWeight: "500",
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(65, 132, 243, 0.3)",
          }}
        >
          Buy
        </button>
      </Tooltip>

      <Tooltip title="Sell (S)" placement="top" arrow TransitionComponent={Grow}>
        <button
          className="sell"
          onClick={handleSellClick}
          style={{
            background: "#ff5722",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            padding: "4px 10px",
            fontSize: "0.75rem",
            fontWeight: "500",
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(255, 87, 34, 0.3)",
          }}
        >
          Sell
        </button>
      </Tooltip>

      <Tooltip title="Analytics & Chart" placement="top" arrow TransitionComponent={Grow}>
        <button
          onClick={handleAnalyticsClick}
          style={{
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: "4px",
            padding: "4px 6px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#555",
          }}
        >
          <BarChartOutlined style={{ fontSize: "1rem" }} />
        </button>
      </Tooltip>

      <Tooltip title="More" placement="top" arrow TransitionComponent={Grow}>
        <button
          onClick={handleAnalyticsClick}
          style={{
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: "4px",
            padding: "4px 6px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#555",
          }}
        >
          <MoreHoriz style={{ fontSize: "1rem" }} />
        </button>
      </Tooltip>
    </div>
  );
};