import { useEffect, useRef } from "react";
import { twelveDataService } from "../services/twelveDataService";
import { simulateLivePriceTick } from "../services/simulationEngine";

/**
 * Custom Hook: useStockTicker
 * Handles optimized polling intervals, tab visibility pausing, batch API requests,
 * and rate-limit mitigation for the Dual-Market trading platform.
 */
export const useStockTicker = ({
  stocks,
  setStocks,
  isMockMode,
  refreshQuota,
  pollingIntervalMs = 20000, // 20s for live Twelve Data API
  simulationIntervalMs = 2500, // 2.5s for rich UI animations in Mock Mode
}) => {
  const isTabVisibleRef = useRef(true);
  const intervalRef = useRef(null);

  // Tab visibility change listener: stop polling when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      isTabVisibleRef.current = document.visibilityState === "visible";
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    // Clear any previous running timer
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (isMockMode) {
      // --- SIMULATION / MOCK ENGINE ---
      intervalRef.current = setInterval(() => {
        if (!isTabVisibleRef.current) return;

        // Pick 1-3 random stocks to update price per tick for realistic trading board activity
        setStocks((prevStocks) => {
          const randomIndex = Math.floor(Math.random() * prevStocks.length);
          const randomIndex2 = Math.floor(Math.random() * prevStocks.length);

          return prevStocks.map((stock, idx) => {
            if (idx === randomIndex || idx === randomIndex2) {
              return simulateLivePriceTick(stock);
            }
            return stock;
          });
        });
      }, simulationIntervalMs);
    } else {
      // --- LIVE TWELVE DATA POLLING ENGINE ---
      const fetchLiveBatch = async () => {
        if (!isTabVisibleRef.current) return;

        // Extract US symbols (Twelve Data supports standard ticker format)
        const usSymbols = stocks
          .filter((s) => s.market === "NASDAQ" || s.country === "US")
          .map((s) => s.symbol);

        if (usSymbols.length > 0) {
          const result = await twelveDataService.fetchBatchQuotes(usSymbols);
          refreshQuota();

          if (result.success && result.data) {
            setStocks((prevStocks) =>
              prevStocks.map((stock) => {
                const quote = result.data[stock.symbol];
                if (quote && quote.close) {
                  const newPrice = parseFloat(quote.close);
                  const prevClose = parseFloat(quote.previous_close) || stock.previousClose;
                  const change = parseFloat((newPrice - prevClose).toFixed(2));
                  const changePercent = parseFloat(((change / prevClose) * 100).toFixed(2));

                  return {
                    ...stock,
                    price: newPrice,
                    previousClose: prevClose,
                    change,
                    changePercent,
                    high: parseFloat(quote.high) || stock.high,
                    low: parseFloat(quote.low) || stock.low,
                    volume: quote.volume ? `${(parseInt(quote.volume, 10) / 1000000).toFixed(1)}M` : stock.volume,
                    sparkline: [...(stock.sparkline || []).slice(1), newPrice],
                    lastTickTime: Date.now(),
                  };
                }
                return stock;
              })
            );
          }
        }
      };

      // Trigger immediate initial fetch on mount/toggle
      fetchLiveBatch();

      intervalRef.current = setInterval(() => {
        fetchLiveBatch();
      }, pollingIntervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isMockMode, pollingIntervalMs, simulationIntervalMs, setStocks, refreshQuota, stocks]);
};
