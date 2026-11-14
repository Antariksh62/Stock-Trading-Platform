const axios = require("axios");
const { stockPriceMap } = require("../data/stocksData");

/**
 * Resilient Market Ticker Service
 * 
 * Key Architecture:
 * 1. Server-side batch polling (Every 20 seconds = 3 calls/min <= 8 credits/min free quota).
 * 2. In-memory caching: Prevents client fan-out duplicate calls.
 * 3. Graceful degradation: If Twelve Data hits 429 rate limit or symbol restrictions,
 *    seamlessly falls back to secondary public exchange feed (^NSEI, ^BSESN, QQQ).
 * 4. Socket.IO broadcast: Pushes updates to all active clients reactively.
 * 5. Limit Order Matching Hooks: Integrates with orderExecutionService to match pending orders on price ticks.
 */

class TickerService {
  constructor() {
    this.apiKey = process.env.TWELVE_DATA_API_KEY || null;
    this.pollIntervalMs = 20000; // 20s = 3 requests per minute
    this.timer = null;
    this.matchingTimer = null;
    this.io = null;

    // In-memory cache holding latest validated quotes
    this.cachedData = {
      source: "initial_cache",
      lastUpdated: new Date().toISOString(),
      indices: {
        nifty: { name: "NIFTY 50", symbol: "^NSEI", points: 22520.45, percent: "+1.30%", isDown: false, prevClose: 22231.80 },
        sensex: { name: "SENSEX", symbol: "^BSESN", points: 72472.33, percent: "+1.23%", isDown: false, prevClose: 71593.20 },
        nasdaq: { name: "NASDAQ (QQQ)", symbol: "QQQ", points: 488.50, percent: "+0.51%", isDown: false, prevClose: 486.02 },
      },
    };

    // Symbol-level quotes cache for Watchlist pagination
    this.quotesCache = {};
    this.dailyQuotaExhausted = true; // Twelve Data 800 daily credits exceeded for today (2,301 used)

    // Callback handlers for order matching engine
    this.matchingHandler = null; // async (symbol, newPrice) => ...
    this.periodicMatchingHandler = null; // async () => ...
  }

  /**
   * Set callbacks for order matching
   */
  setMatchingHandlers({ onStockPriceUpdate = null, onPeriodicCheck = null } = {}) {
    this.matchingHandler = onStockPriceUpdate;
    this.periodicMatchingHandler = onPeriodicCheck;
  }

  /**
   * Get the trusted market price of a stock (LTP).
   * Hierarchy:
   * 1. Live quotes cache (if fresh)
   * 2. Authoritative baseline stock price map (Nifty 50 / Nasdaq 100)
   * 3. Fallback price parameter (if valid > 0)
   * 4. Default 100.00
   */
  getMarketPrice(rawSymbol, fallbackPrice = null) {
    if (!rawSymbol) return fallbackPrice || 100.0;
    const sym = String(rawSymbol).trim().toUpperCase();

    if (this.quotesCache[sym] && this.quotesCache[sym].data && typeof this.quotesCache[sym].data.price === "number") {
      return Number(this.quotesCache[sym].data.price.toFixed(2));
    }
    if (stockPriceMap[sym] !== undefined) {
      return Number(stockPriceMap[sym].toFixed(2));
    }
    const numFallback = Number(fallbackPrice);
    if (!isNaN(numFallback) && numFallback > 0) {
      return Number(numFallback.toFixed(2));
    }
    return 100.0;
  }

  /**
   * Get market quote with Ask and Bid prices.
   * Documented approximation: In this single-quote broker simulation without a full
   * multi-broker L2/L3 order book, the available ask and bid liquidity prices are
   * referenced against the Last Traded Price (LTP).
   */
  getMarketQuotes(rawSymbol, fallbackPrice = null) {
    const ltp = this.getMarketPrice(rawSymbol, fallbackPrice);
    return {
      symbol: String(rawSymbol).toUpperCase(),
      price: ltp,
      ask: ltp,
      bid: ltp,
    };
  }

  /**
   * Update or simulate a stock price quote in the cache and trigger pending order matching.
   */
  async updateQuote(rawSymbol, newPrice) {
    const sym = String(rawSymbol).trim().toUpperCase();
    const price = Number(Number(newPrice).toFixed(2));
    if (isNaN(price) || price <= 0) return null;

    const prevPrice = this.getMarketPrice(sym);
    const diff = price - prevPrice;
    const pct = prevPrice > 0 ? (diff / prevPrice) * 100 : 0;

    const quoteData = {
      price,
      percent: (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%",
      isDown: pct < 0,
      prevClose: prevPrice,
    };

    this.quotesCache[sym] = { timestamp: Date.now(), data: quoteData };

    // Trigger order matching engine for this stock
    if (this.matchingHandler) {
      try {
        await this.matchingHandler(sym, price);
      } catch (err) {
        console.warn(`[TickerService] Error running matching handler for ${sym}:`, err.message);
      }
    }

    return quoteData;
  }

  /**
   * Initialize Socket.IO instance and start server-side polling interval
   */
  start(ioInstance) {
    this.io = ioInstance;
    console.log("[TickerService] Initializing server-side ticker engine with 20s batch polling...");

    // Immediately fetch initial quote
    this.fetchAndUpdate();

    // Start interval loop for market indices
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.fetchAndUpdate();
      }, this.pollIntervalMs);
    }

    // Start periodic pending order matching sweep (every 10 seconds)
    if (!this.matchingTimer) {
      this.matchingTimer = setInterval(async () => {
        if (this.periodicMatchingHandler) {
          try {
            await this.periodicMatchingHandler();
          } catch (e) {
            console.warn("[TickerService] Periodic matching sweep error:", e.message);
          }
        }
      }, 10000);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.matchingTimer) {
      clearInterval(this.matchingTimer);
      this.matchingTimer = null;
    }
  }

  getLatest() {
    return this.cachedData;
  }

  /**
   * Primary batch fetch routine with fallback resilience
   */
  async fetchAndUpdate() {
    let updated = false;

    // 1. Attempt Twelve Data Batch Request (symbol=QQQ,NIFTY,SENSEX)
    try {
      if (this.apiKey && !this.dailyQuotaExhausted) {
        const tdUrl = `https://api.twelvedata.com/quote?symbol=QQQ,NIFTY,SENSEX&apikey=${this.apiKey}`;
        const response = await axios.get(tdUrl, { timeout: 8000 });

        if (response.data && !response.data.code && !response.data.status?.includes("error")) {
          const quotes = response.data;
          
          if (quotes["QQQ"] && quotes["QQQ"].close) {
            const price = parseFloat(quotes["QQQ"].close);
            const pct = parseFloat(quotes["QQQ"].percent_change || 0);
            this.cachedData.indices.nasdaq = {
              name: "NASDAQ (QQQ)",
              symbol: "QQQ",
              points: Number(price.toFixed(2)),
              percent: (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%",
              isDown: pct < 0,
              prevClose: parseFloat(quotes["QQQ"].previous_close || price),
            };
            updated = true;
          }

          if (quotes["NIFTY"] && quotes["NIFTY"].close) {
            const price = parseFloat(quotes["NIFTY"].close);
            const pct = parseFloat(quotes["NIFTY"].percent_change || 0);
            this.cachedData.indices.nifty = {
              name: "NIFTY 50",
              symbol: "^NSEI",
              points: Number(price.toFixed(2)),
              percent: (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%",
              isDown: pct < 0,
              prevClose: parseFloat(quotes["NIFTY"].previous_close || price),
            };
            updated = true;
          }

          if (quotes["SENSEX"] && quotes["SENSEX"].close) {
            const price = parseFloat(quotes["SENSEX"].close);
            const pct = parseFloat(quotes["SENSEX"].percent_change || 0);
            this.cachedData.indices.sensex = {
              name: "SENSEX",
              symbol: "^BSESN",
              points: Number(price.toFixed(2)),
              percent: (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%",
              isDown: pct < 0,
              prevClose: parseFloat(quotes["SENSEX"].previous_close || price),
            };
            updated = true;
          }

          if (updated) {
            this.cachedData.source = "twelve_data_batch";
          }
        }
      }
    } catch (err) {
      // Twelve data rate-limited (HTTP 429) or symbol unavailable -> graceful fallback
    }

    // 2. Resilient Exchange Fallback if Twelve Data was rate-limited or missing Indian index data
    if (!updated) {
      try {
        const [niftyRes, sensexRes, qqqRes] = await Promise.all([
          axios.get("https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI", {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 6000,
          }),
          axios.get("https://query1.finance.yahoo.com/v8/finance/chart/%5EBSESN", {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 6000,
          }),
          axios.get("https://query1.finance.yahoo.com/v8/finance/chart/QQQ", {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 6000,
          }),
        ]);

        const parseMeta = (resObj, name, symbol) => {
          const meta = resObj.data?.chart?.result?.[0]?.meta;
          if (!meta) return null;
          const price = Number(meta.regularMarketPrice || 0);
          const prevClose = Number(meta.chartPreviousClose || price);
          const diff = price - prevClose;
          const pct = prevClose > 0 ? (diff / prevClose) * 100 : 0;
          return {
            name,
            symbol,
            points: Number(price.toFixed(2)),
            percent: (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%",
            isDown: pct < 0,
            prevClose: Number(prevClose.toFixed(2)),
          };
        };

        const parsedNifty = parseMeta(niftyRes, "NIFTY 50", "^NSEI");
        const parsedSensex = parseMeta(sensexRes, "SENSEX", "^BSESN");
        const parsedQqq = parseMeta(qqqRes, "NASDAQ (QQQ)", "QQQ");

        if (parsedNifty) this.cachedData.indices.nifty = parsedNifty;
        if (parsedSensex) this.cachedData.indices.sensex = parsedSensex;
        if (parsedQqq) this.cachedData.indices.nasdaq = parsedQqq;

        this.cachedData.source = "exchange_resilient_feed";
        updated = true;
      } catch (fbErr) {
        // Keep in-memory cache intact
      }
    }

    this.cachedData.lastUpdated = new Date().toISOString();

    // 3. Broadcast to all connected clients via Socket.IO
    if (this.io) {
      this.io.emit("ticker_update", this.cachedData);
    }

    return this.cachedData;
  }

  /**
   * Batch fetch quotes for an array of symbols (e.g. current page of 10 stocks)
   * Protects free API tier (8 credits/min) via in-memory cache and returns rate limit notifications.
   */
  async getQuotesForSymbols(symbolsArray) {
    if (!Array.isArray(symbolsArray) || symbolsArray.length === 0) {
      return { quotes: {}, rateLimitExhausted: false, message: null };
    }

    const now = Date.now();
    const resultQuotes = {};
    const missingSymbols = [];

    // 1. Check in-memory cache (fresh within 45 seconds)
    for (const rawSym of symbolsArray) {
      const sym = String(rawSym).trim().toUpperCase();
      if (this.quotesCache[sym] && now - this.quotesCache[sym].timestamp < 45000) {
        resultQuotes[sym] = this.quotesCache[sym].data;
      } else {
        missingSymbols.push(sym);
      }
    }

    let rateLimitExhausted = false;
    let message = null;

    // 2. Fetch missing symbols in a single batch (max 10 symbols per request)
    if (missingSymbols.length > 0 && this.apiKey && !this.dailyQuotaExhausted) {
      try {
        const querySyms = missingSymbols.slice(0, 10).join(",");
        const tdUrl = `https://api.twelvedata.com/quote?symbol=${querySyms}&apikey=${this.apiKey}`;
        const response = await axios.get(tdUrl, { timeout: 7000 });

        if (response.data) {
          if (
            response.data.code === 429 ||
            response.data.status === "error" ||
            response.data.message?.toLowerCase().includes("limit")
          ) {
            rateLimitExhausted = true;
            message = response.data.message || "Twelve Data API call limit reached. Showing baseline quotes.";
          } else {
            const dataObj = response.data;
            for (const sym of missingSymbols) {
              const item = dataObj[sym] || (missingSymbols.length === 1 && dataObj.symbol === sym ? dataObj : null);
              if (item && item.close) {
                const price = parseFloat(item.close);
                const pct = parseFloat(item.percent_change || 0);
                const quoteData = {
                  price: Number(price.toFixed(2)),
                  percent: (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%",
                  isDown: pct < 0,
                  prevClose: parseFloat(item.previous_close || price),
                };
                this.quotesCache[sym] = { timestamp: now, data: quoteData };
                resultQuotes[sym] = quoteData;

                // Trigger limit order matching on fresh price update
                if (this.matchingHandler) {
                  this.matchingHandler(sym, quoteData.price).catch(() => {});
                }
              }
            }
          }
        }
      } catch (err) {
        if (err.response?.status === 429 || err.message?.includes("429")) {
          rateLimitExhausted = true;
          message = "Twelve Data rate limit (8 credits/min) exhausted. Serving baseline prices.";
        }
      }
    }

    // 3. Fallback for any symbols still missing: populate from authoritative stockPriceMap
    for (const rawSym of symbolsArray) {
      const sym = String(rawSym).trim().toUpperCase();
      if (!resultQuotes[sym]) {
        const basePrice = stockPriceMap[sym] || 100.0;
        const baselineQuote = {
          price: basePrice,
          percent: "+0.00%",
          isDown: false,
          prevClose: basePrice,
        };
        resultQuotes[sym] = baselineQuote;
        this.quotesCache[sym] = { timestamp: now, data: baselineQuote };
      }
    }

    return {
      quotes: resultQuotes,
      rateLimitExhausted,
      message,
    };
  }
}

const tickerService = new TickerService();
module.exports = { tickerService };
