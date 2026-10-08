import axios from "axios";

const BASE_URL = "https://api.twelvedata.com";
const DAILY_LIMIT = 800;

class TwelveDataService {
  constructor() {
    this.apiKey = localStorage.getItem("twelve_data_api_key") || "e3a7567d8f13431faf3c7e751e797817";
    this.callsToday = this.getStoredCallsToday();
    this.isRateLimited = false;
    this.lastError = null;
  }

  setApiKey(key) {
    this.apiKey = key.trim();
    localStorage.setItem("twelve_data_api_key", this.apiKey);
  }

  getApiKey() {
    return this.apiKey;
  }

  getStoredCallsToday() {
    const today = new Date().toISOString().slice(0, 10);
    const storedDate = localStorage.getItem("twelve_data_date");
    if (storedDate !== today) {
      localStorage.setItem("twelve_data_date", today);
      localStorage.setItem("twelve_data_calls_today", "0");
      return 0;
    }
    return parseInt(localStorage.getItem("twelve_data_calls_today") || "0", 10);
  }

  incrementCallCount(count = 1) {
    this.callsToday += count;
    localStorage.setItem("twelve_data_calls_today", this.callsToday.toString());
  }

  getQuotaInfo() {
    const remaining = Math.max(0, DAILY_LIMIT - this.callsToday);
    const percentUsed = Math.min(100, Math.round((this.callsToday / DAILY_LIMIT) * 100));
    return {
      used: this.callsToday,
      total: DAILY_LIMIT,
      remaining,
      percentUsed,
      isExhausted: remaining <= 0 || this.isRateLimited,
      lastError: this.lastError,
    };
  }

  /**
   * Batch fetch quotes for multiple tickers in a single API call to minimize quota consumption.
   * e.g., Twelve Data allows ?symbol=AAPL,TSLA,NVDA,MSFT&apikey=...
   */
  async fetchBatchQuotes(symbols = []) {
    if (!this.apiKey) {
      return { success: false, reason: "NO_API_KEY", data: null };
    }

    if (this.callsToday >= DAILY_LIMIT) {
      this.isRateLimited = true;
      return { success: false, reason: "QUOTA_EXHAUSTED", data: null };
    }

    try {
      const symbolParam = symbols.join(",");
      const response = await axios.get(`${BASE_URL}/quote`, {
        params: {
          symbol: symbolParam,
          apikey: this.apiKey,
        },
        timeout: 10000,
      });

      this.incrementCallCount(1);
      this.isRateLimited = false;
      this.lastError = null;

      // Twelve data returns either single object (if 1 symbol) or map of symbol -> quote
      let quotesMap = {};
      if (symbols.length === 1 && response.data.symbol) {
        quotesMap[response.data.symbol] = response.data;
      } else if (response.data && typeof response.data === "object") {
        quotesMap = response.data;
      }

      return { success: true, data: quotesMap };
    } catch (error) {
      console.error("Twelve Data API Error:", error);
      if (error.response && error.response.status === 429) {
        this.isRateLimited = true;
        this.lastError = "Rate limit reached (HTTP 429). Switch to Mock Mode or wait.";
      } else {
        this.lastError = error.message || "Failed to fetch from Twelve Data";
      }
      return { success: false, reason: "API_ERROR", error: this.lastError };
    }
  }

  /**
   * Fetch time series candlestick data for a specific asset
   */
  async fetchTimeSeries(symbol, interval = "5min", outputsize = 30) {
    if (!this.apiKey || this.callsToday >= DAILY_LIMIT) {
      return { success: false, reason: "NO_API_KEY_OR_LIMIT" };
    }

    try {
      const response = await axios.get(`${BASE_URL}/time_series`, {
        params: {
          symbol,
          interval,
          outputsize,
          apikey: this.apiKey,
        },
        timeout: 10000,
      });

      this.incrementCallCount(1);

      if (response.data && response.data.values) {
        const formattedCandles = response.data.values.map((item) => ({
          time: item.datetime,
          label: item.datetime.slice(11, 16) || item.datetime.slice(5, 10),
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseInt(item.volume || "0", 10),
          isBullish: parseFloat(item.close) >= parseFloat(item.open),
        })).reverse();

        return { success: true, data: formattedCandles };
      }

      return { success: false, reason: "INVALID_FORMAT", data: null };
    } catch (error) {
      console.error("Twelve Data TimeSeries Error:", error);
      return { success: false, error: error.message };
    }
  }
}

export const twelveDataService = new TwelveDataService();
