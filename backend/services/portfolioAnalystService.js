const { HoldingsModel } = require("../model/HoldingsModel");
const { FundsModel } = require("../model/FundsModel");
const { GoogleGenAI } = require("@google/genai");

// Sector mapping for standard Indian/US equities
const sectorMap = {
  RELIANCE: "Energy & Conglomerate",
  TCS: "Information Technology",
  HDFCBANK: "Financial Services",
  INFY: "Information Technology",
  ICICIBANK: "Financial Services",
  BHARTIARTL: "Telecommunication",
  HINDUNILVR: "Consumer FMCG",
  ITC: "Consumer Goods & FMCG",
  SBIN: "Financial Services",
  LTIM: "Information Technology",
  LT: "Engineering & Infrastructure",
  BAJFINANCE: "Financial Services",
  KOTAKBANK: "Financial Services",
  AXISBANK: "Financial Services",
  HCLTECH: "Information Technology",
  ASIANPAINT: "Consumer Goods",
  MARUTI: "Automotive",
  SUNPHARMA: "Healthcare & Pharma",
  TITAN: "Consumer Discretionary",
  ULTRACEMCO: "Materials & Cement",
  TATASTEEL: "Metals & Mining",
  NTPC: "Power & Utilities",
  POWERGRID: "Power & Utilities",
  "M&M": "Automotive",
  TATAMOTORS: "Automotive",
  ADANIENT: "Diversified Metals & Infra",
  ADANIPORTS: "Infrastructure & Logistics",
  COALINDIA: "Energy & Mining",
  ONGC: "Energy & Oil",
  BAJAJFINSV: "Financial Services",
  AAPL: "Technology & Hardware",
  NVDA: "Semiconductors & AI",
  TSLA: "Automotive & Clean Tech",
  MSFT: "Software & Cloud",
  GOOGL: "Internet & Digital Advertising",
  AMZN: "E-Commerce & Cloud",
  META: "Social Media & Meta",
  NFLX: "Entertainment & Streaming",
};

/**
 * Perform server-side calculation of portfolio statistics and generate Gemini AI insights
 */
const analyzePortfolio = async (userId = "demo_user") => {
  // 1. Fetch user's actual holdings and funds from MongoDB
  let holdings = await HoldingsModel.find({ $or: [{ userId }, { userId: { $exists: false } }] });
  let funds = await FundsModel.findOne({ userId });

  if (!funds) {
    funds = { availableCash: 100000.0, availableMargin: 100000.0, usedMargin: 0.0 };
  }

  // If no user-specific holdings, fallback to available holdings
  if (!holdings || holdings.length === 0) {
    holdings = await HoldingsModel.find({});
  }

  // 2. Compute deterministic mathematical metrics
  let totalInvestment = 0;
  let totalCurrentValue = 0;
  const processedHoldings = [];
  const sectorTotals = {};

  holdings.forEach((h) => {
    const qty = Number(h.qty) || 0;
    const avg = Number(h.avg) || 0;
    const price = Number(h.price) || 0;

    if (qty > 0) {
      const investment = avg * qty;
      const currentValue = price * qty;
      const pnl = currentValue - investment;
      const pnlPct = investment > 0 ? (pnl / investment) * 100 : 0;
      const sector = sectorMap[h.name] || "Other Equities";

      totalInvestment += investment;
      totalCurrentValue += currentValue;
      sectorTotals[sector] = (sectorTotals[sector] || 0) + currentValue;

      processedHoldings.push({
        name: h.name,
        qty,
        avg: Number(avg.toFixed(2)),
        price: Number(price.toFixed(2)),
        investment: Number(investment.toFixed(2)),
        currentValue: Number(currentValue.toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        pnlPercent: Number(pnlPct.toFixed(2)),
        sector,
      });
    }
  });

  const totalPnL = totalCurrentValue - totalInvestment;
  const pnlPercent = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;

  // Calculate weights & sort gainers/losers
  processedHoldings.forEach((h) => {
    h.weightPercent = totalCurrentValue > 0 ? Number(((h.currentValue / totalCurrentValue) * 100).toFixed(1)) : 0;
  });

  const sortedByPnL = [...processedHoldings].sort((a, b) => b.pnlPercent - a.pnlPercent);
  const topGainers = sortedByPnL.slice(0, 3);
  const topLosers = sortedByPnL.slice(-3).reverse().filter((l) => l.pnlPercent < 0 || sortedByPnL.length <= 3);

  // Sector breakdown percentages
  const sectorBreakdown = {};
  Object.keys(sectorTotals).forEach((sec) => {
    sectorBreakdown[sec] = totalCurrentValue > 0 ? Number(((sectorTotals[sec] / totalCurrentValue) * 100).toFixed(1)) : 0;
  });

  const sortedHoldingsByWeight = [...processedHoldings].sort((a, b) => b.weightPercent - a.weightPercent);
  const topHolding = sortedHoldingsByWeight[0] || { name: "None", weightPercent: 0 };
  const totalAssets = totalCurrentValue + (funds.availableCash || 0);
  const cashRatio = totalAssets > 0 ? Number(((funds.availableCash / totalAssets) * 100).toFixed(1)) : 0;

  const metrics = {
    totalInvestment: Number(totalInvestment.toFixed(2)),
    totalCurrentValue: Number(totalCurrentValue.toFixed(2)),
    totalPnL: Number(totalPnL.toFixed(2)),
    pnlPercent: Number(pnlPercent.toFixed(2)),
    holdingsCount: processedHoldings.length,
    availableCash: Number((funds.availableCash || 0).toFixed(2)),
    cashRatioPercent: cashRatio,
    topHolding: {
      name: topHolding.name,
      weightPercent: topHolding.weightPercent,
    },
    topGainers: topGainers.map((g) => ({ name: g.name, pnlPercent: g.pnlPercent, pnl: g.pnl })),
    topLosers: topLosers.map((l) => ({ name: l.name, pnlPercent: l.pnlPercent, pnl: l.pnl })),
    sectorBreakdown,
  };

  // 3. AI Analysis Generation using Gemini or Deterministic Engine Fallback
  let analysis = null;
  let source = "gemini-2.5-flash";

  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "") {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY.trim() });
      const prompt = `You are a Senior Quantitative Portfolio Analyst. You have been provided with authoritative, pre-calculated portfolio facts for an investor.

AUTHORITATIVE PORTFOLIO FACTS:
- Total Investment Cost: ₹${metrics.totalInvestment.toLocaleString()}
- Total Current Value: ₹${metrics.totalCurrentValue.toLocaleString()}
- Overall Net Profit/Loss: ₹${metrics.totalPnL.toLocaleString()} (${metrics.pnlPercent >= 0 ? "+" : ""}${metrics.pnlPercent.toFixed(2)}%)
- Number of Stock Holdings: ${metrics.holdingsCount}
- Liquid Virtual Cash: ₹${metrics.availableCash.toLocaleString()} (${metrics.cashRatioPercent}% of total capital)
- Top Largest Holding: ${metrics.topHolding.name} (${metrics.topHolding.weightPercent}% of portfolio equity)
- Top 3 Gainers: ${JSON.stringify(metrics.topGainers)}
- Top 3 Underperformers: ${JSON.stringify(metrics.topLosers)}
- Sector Breakdown: ${JSON.stringify(metrics.sectorBreakdown)}

INSTRUCTIONS:
1. Provide a rigorous, professional, objective portfolio review based ONLY on the supplied facts.
2. Return a valid JSON object strictly matching this schema:
{
  "overview": "2-3 concise sentences on portfolio performance, asset size, and overall direction.",
  "topGainersLosers": "2-3 sentences analyzing what drove the gains and which positions dragged returns.",
  "concentrationAnalysis": "2-3 sentences analyzing sector weights and single-stock concentration risk.",
  "riskObservations": "2-3 sentences highlighting exposure observations (e.g. cash buffer, sector concentration).",
  "actionableSuggestions": "2-3 constructive educational areas or metrics the user could investigate further."
}
Do NOT include markdown formatting backticks outside the JSON. Return only the raw JSON.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      if (response && response.text) {
        let cleanText = response.text.trim();
        if (cleanText.startsWith("```json")) {
          cleanText = cleanText.replace(/^```json/, "").replace(/```$/, "").trim();
        } else if (cleanText.startsWith("```")) {
          cleanText = cleanText.replace(/^```/, "").replace(/```$/, "").trim();
        }
        analysis = JSON.parse(cleanText);
      }
    } catch (err) {
      console.warn("Gemini API call failed, falling back to deterministic analysis engine:", err.message);
      source = "deterministic_rule_engine";
    }
  } else {
    source = "deterministic_rule_engine";
  }

  // 4. Fallback Deterministic Analytical Rule Engine (ensures 100% reliability even if offline)
  if (!analysis) {
    const isProfit = totalPnL >= 0;
    const dominantSector = Object.entries(sectorBreakdown).sort((a, b) => b[1] - a[1])[0] || ["Diversified", 0];

    analysis = {
      overview: `The portfolio holds ${metrics.holdingsCount} active instruments with a current valuation of ₹${metrics.totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} on an invested capital base of ₹${metrics.totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2 })}, yielding a total return of ${isProfit ? "+" : ""}${metrics.pnlPercent.toFixed(2)}% (₹${metrics.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}).`,
      topGainersLosers: topGainers.length > 0
        ? `Outperformance is led by ${topGainers.map((g) => `${g.name} (${g.pnlPercent >= 0 ? "+" : ""}${g.pnlPercent.toFixed(1)}%)`).join(", ")}, while ${topLosers.map((l) => `${l.name} (${l.pnlPercent.toFixed(1)}%)`).join(", ")} represent areas of capital drag.`
        : "Holdings are relatively flat with balanced mark-to-market performance across instruments.",
      concentrationAnalysis: `Asset allocation is led by ${dominantSector[0]} (${dominantSector[1]}% of equity assets), with single-stock concentration peaking in ${topHolding.name} at ${topHolding.weightPercent}% of total equity.`,
      riskObservations: topHolding.weightPercent > 25
        ? `Single-asset concentration in ${topHolding.name} exceeds 25%, increasing portfolio sensitivity to idiosyncratic stock swings. Liquid cash reserves stand at ${metrics.cashRatioPercent}% of total assets.`
        : `The portfolio maintains sound single-asset risk dispersion with no single stock exceeding 25% allocation. Available cash provides a ${metrics.cashRatioPercent}% buffer for opportunistic entries.`,
      actionableSuggestions: `Review whether sector exposure in ${dominantSector[0]} aligns with your risk tolerance, and monitor trailing stop-losses on top performers (${topGainers.map((g) => g.name).join(", ")}) to protect unrealized gains.`,
    };
  }

  return {
    success: true,
    source,
    timestamp: new Date().toISOString(),
    metrics,
    analysis,
    disclaimer: "This AI-assisted portfolio review is generated for informational and paper-trading practice purposes only and does not constitute certified financial or investment advice.",
  };
};

module.exports = {
  analyzePortfolio,
};
