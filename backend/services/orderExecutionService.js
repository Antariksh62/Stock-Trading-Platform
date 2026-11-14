const { OrdersModel } = require("../model/OrdersModel");
const { HoldingsModel } = require("../model/HoldingsModel");
const { PositionsModel } = require("../model/PositionsModel");
const { FundsModel } = require("../model/FundsModel");
const { tickerService } = require("./tickerService");
const { withTransaction } = require("../util/dbTransaction");

// In-memory idempotency cache (keyed by `${userId}:${idempotencyKey}` -> orderResult, TTL 60s)
const idempotencyCache = new Map();

// In-memory user queue locks to serialize concurrent orders per user
const userLocks = new Map();

const acquireUserLock = async (userId) => {
  while (userLocks.get(userId)) {
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  userLocks.set(userId, true);
};

const releaseUserLock = (userId) => {
  userLocks.delete(userId);
};

// Global dependencies for real-time broadcast
let globalIo = null;
let globalBroadcastUserUpdates = null;

const setOrderExecutionDependencies = ({ io = null, broadcastUserUpdates = null } = {}) => {
  if (io) globalIo = io;
  if (broadcastUserUpdates) globalBroadcastUserUpdates = broadcastUserUpdates;
};

// Ensure user has a funds record initialized
const getOrCreateUserFunds = async (userId, session = null) => {
  const query = FundsModel.findOne({ userId });
  if (session) query.session(session);
  let funds = await query;
  if (!funds) {
    funds = await FundsModel.create(
      [
        {
          userId,
          availableMargin: 0.0,
          usedMargin: 0.0,
          availableCash: 0.0,
          openingBalance: 0.0,
          payin: 0.0,
          span: 0.0,
          deliveryMargin: 0.0,
          exposure: 0.0,
          optionsPremium: 0.0,
        },
      ],
      session ? { session } : {}
    );
    funds = Array.isArray(funds) ? funds[0] : funds;
  }
  return funds;
};

/**
 * Settles an intraday (MIS) trade across all 10 standard position states:
 * 1. Open Long (no prior position, BUY)
 * 2. Increase Long (existing long, BUY)
 * 3. Reduce Long (existing long, SELL, tradeQty < currentQty)
 * 4. Close Long (existing long, SELL, tradeQty === currentQty)
 * 5. Open Short (no prior position, SELL)
 * 6. Increase Short (existing short, SELL)
 * 7. Reduce Short (existing short, BUY, tradeQty < shortQty)
 * 8. Close Short (existing short, BUY, tradeQty === shortQty)
 * 9. Long-to-Short Reversal (existing long, SELL, tradeQty > currentQty)
 * 10. Short-to-Long Reversal (existing short, BUY, tradeQty > shortQty)
 */
const settleMISPosition = async ({
  userId,
  symbol,
  tradeQty,
  tradeMode,
  executionPrice,
  funds,
  session = null,
}) => {
  const query = PositionsModel.findOne({ userId, name: symbol, product: "MIS" });
  if (session) query.session(session);
  const position = await query;

  const currentQty = position ? position.qty : 0;
  const currentAvg = position ? position.avg : 0;

  const calcNet = (avg, price, isShort) => {
    if (!avg || avg <= 0) return "+0.00%";
    const pct = isShort
      ? (((avg - price) / avg) * 100).toFixed(2)
      : (((price - avg) / avg) * 100).toFixed(2);
    return (pct >= 0 ? "+" : "") + pct + "%";
  };

  // Case 1 & 5: Flat / No Existing Position
  if (!position || currentQty === 0) {
    const requiredMargin = Number((tradeQty * executionPrice).toFixed(2));
    if (funds.availableCash < requiredMargin) {
      return {
        success: false,
        rejectionReason: `Insufficient virtual funds for MIS position. Required: ₹${requiredMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}, Available: ₹${funds.availableCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      };
    }

    funds.availableCash = Number((funds.availableCash - requiredMargin).toFixed(2));
    funds.availableMargin = Number((funds.availableMargin - requiredMargin).toFixed(2));
    funds.usedMargin = Number((funds.usedMargin + requiredMargin).toFixed(2));
    funds.updatedAt = new Date();
    await funds.save({ session });

    const newQty = tradeMode === "BUY" ? tradeQty : -tradeQty;
    const isShort = newQty < 0;

    const newPosData = {
      userId,
      product: "MIS",
      name: symbol,
      qty: newQty,
      lockedQty: 0,
      avg: executionPrice,
      price: executionPrice,
      net: "+0.00%",
      day: "+0.00%",
      isLoss: false,
    };

    let createdPosition;
    if (position) {
      Object.assign(position, newPosData);
      createdPosition = await position.save({ session });
    } else {
      const created = await PositionsModel.create([newPosData], session ? { session } : {});
      createdPosition = created[0];
    }

    return {
      success: true,
      state: tradeMode === "BUY" ? "OPEN_LONG" : "OPEN_SHORT",
      realizedPnL: 0,
      position: createdPosition,
    };
  }

  // Case 2, 3, 4, 9: Existing LONG position (currentQty > 0)
  if (currentQty > 0) {
    if (tradeMode === "BUY") {
      // State 2: Increase Long
      const requiredMargin = Number((tradeQty * executionPrice).toFixed(2));
      if (funds.availableCash < requiredMargin) {
        return {
          success: false,
          rejectionReason: `Insufficient virtual funds to increase MIS Long position. Required: ₹${requiredMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}, Available: ₹${funds.availableCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        };
      }

      funds.availableCash = Number((funds.availableCash - requiredMargin).toFixed(2));
      funds.availableMargin = Number((funds.availableMargin - requiredMargin).toFixed(2));
      funds.usedMargin = Number((funds.usedMargin + requiredMargin).toFixed(2));
      funds.updatedAt = new Date();
      await funds.save({ session });

      const newQty = currentQty + tradeQty;
      const newAvg = Number(((currentAvg * currentQty + executionPrice * tradeQty) / newQty).toFixed(2));
      position.qty = newQty;
      position.avg = newAvg;
      position.price = executionPrice;
      position.net = calcNet(newAvg, executionPrice, false);
      position.isLoss = executionPrice < newAvg;
      await position.save({ session });

      return {
        success: true,
        state: "INCREASE_LONG",
        realizedPnL: 0,
        position,
      };
    } else {
      // tradeMode === "SELL" against existing Long
      if (tradeQty < currentQty) {
        // State 3: Reduce Long (partial close)
        const realizedPnL = Number((tradeQty * (executionPrice - currentAvg)).toFixed(2));
        const marginReleased = Number((tradeQty * currentAvg).toFixed(2));
        const netCashReturn = Number((tradeQty * executionPrice).toFixed(2));

        funds.availableCash = Number((funds.availableCash + netCashReturn).toFixed(2));
        funds.availableMargin = Number((funds.availableMargin + netCashReturn).toFixed(2));
        funds.usedMargin = Math.max(0, Number((funds.usedMargin - marginReleased).toFixed(2)));
        funds.updatedAt = new Date();
        await funds.save({ session });

        position.qty = currentQty - tradeQty;
        position.price = executionPrice;
        position.net = calcNet(position.avg, executionPrice, false);
        position.isLoss = executionPrice < position.avg;
        await position.save({ session });

        return {
          success: true,
          state: "REDUCE_LONG",
          realizedPnL,
          position,
        };
      } else if (tradeQty === currentQty) {
        // State 4: Close Long (full exit)
        const realizedPnL = Number((currentQty * (executionPrice - currentAvg)).toFixed(2));
        const marginReleased = Number((currentQty * currentAvg).toFixed(2));
        const netCashReturn = Number((currentQty * executionPrice).toFixed(2));

        funds.availableCash = Number((funds.availableCash + netCashReturn).toFixed(2));
        funds.availableMargin = Number((funds.availableMargin + netCashReturn).toFixed(2));
        funds.usedMargin = Math.max(0, Number((funds.usedMargin - marginReleased).toFixed(2)));
        funds.updatedAt = new Date();
        await funds.save({ session });

        await PositionsModel.deleteOne({ _id: position._id }).session(session);

        return {
          success: true,
          state: "CLOSE_LONG",
          realizedPnL,
          position: null,
        };
      } else {
        // State 9: Long-to-Short Reversal (tradeQty > currentQty)
        const closeQty = currentQty;
        const shortQty = tradeQty - currentQty;

        const realizedPnL = Number((closeQty * (executionPrice - currentAvg)).toFixed(2));
        const marginReleased = Number((closeQty * currentAvg).toFixed(2));
        const cashFromClose = Number((closeQty * executionPrice).toFixed(2));
        const marginRequiredForShort = Number((shortQty * executionPrice).toFixed(2));

        const effectiveAvailableCash = Number((funds.availableCash + cashFromClose).toFixed(2));
        if (effectiveAvailableCash < marginRequiredForShort) {
          return {
            success: false,
            rejectionReason: `Insufficient virtual funds for Long-to-Short reversal. Required for short leg: ₹${marginRequiredForShort.toLocaleString(undefined, { minimumFractionDigits: 2 })}, Effective Available: ₹${effectiveAvailableCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
          };
        }

        funds.availableCash = Number((effectiveAvailableCash - marginRequiredForShort).toFixed(2));
        funds.availableMargin = Number((funds.availableMargin + cashFromClose - marginRequiredForShort).toFixed(2));
        funds.usedMargin = Math.max(0, Number((funds.usedMargin - marginReleased + marginRequiredForShort).toFixed(2)));
        funds.updatedAt = new Date();
        await funds.save({ session });

        position.qty = -shortQty;
        position.avg = executionPrice;
        position.price = executionPrice;
        position.net = "+0.00%";
        position.isLoss = false;
        await position.save({ session });

        return {
          success: true,
          state: "REVERSAL_LONG_TO_SHORT",
          realizedPnL,
          position,
        };
      }
    }
  }

  // Case 6, 7, 8, 10: Existing SHORT position (currentQty < 0)
  if (currentQty < 0) {
    const shortQty = Math.abs(currentQty);

    if (tradeMode === "SELL") {
      // State 6: Increase Short
      const requiredMargin = Number((tradeQty * executionPrice).toFixed(2));
      if (funds.availableCash < requiredMargin) {
        return {
          success: false,
          rejectionReason: `Insufficient virtual funds to increase MIS Short position. Required: ₹${requiredMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}, Available: ₹${funds.availableCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        };
      }

      funds.availableCash = Number((funds.availableCash - requiredMargin).toFixed(2));
      funds.availableMargin = Number((funds.availableMargin - requiredMargin).toFixed(2));
      funds.usedMargin = Number((funds.usedMargin + requiredMargin).toFixed(2));
      funds.updatedAt = new Date();
      await funds.save({ session });

      const newShortQty = shortQty + tradeQty;
      const newAvg = Number(((currentAvg * shortQty + executionPrice * tradeQty) / newShortQty).toFixed(2));
      position.qty = -newShortQty;
      position.avg = newAvg;
      position.price = executionPrice;
      position.net = calcNet(newAvg, executionPrice, true);
      position.isLoss = executionPrice > newAvg;
      await position.save({ session });

      return {
        success: true,
        state: "INCREASE_SHORT",
        realizedPnL: 0,
        position,
      };
    } else {
      // tradeMode === "BUY" against existing Short (Cover)
      if (tradeQty < shortQty) {
        // State 7: Reduce Short (partial cover)
        const realizedPnL = Number((tradeQty * (currentAvg - executionPrice)).toFixed(2));
        const marginReleased = Number((tradeQty * currentAvg).toFixed(2));
        const netCashReturn = Number((marginReleased + realizedPnL).toFixed(2));

        funds.availableCash = Number((funds.availableCash + netCashReturn).toFixed(2));
        funds.availableMargin = Number((funds.availableMargin + netCashReturn).toFixed(2));
        funds.usedMargin = Math.max(0, Number((funds.usedMargin - marginReleased).toFixed(2)));
        funds.updatedAt = new Date();
        await funds.save({ session });

        const remainingShortQty = shortQty - tradeQty;
        position.qty = -remainingShortQty;
        position.price = executionPrice;
        position.net = calcNet(position.avg, executionPrice, true);
        position.isLoss = executionPrice > position.avg;
        await position.save({ session });

        return {
          success: true,
          state: "REDUCE_SHORT",
          realizedPnL,
          position,
        };
      } else if (tradeQty === shortQty) {
        // State 8: Close Short (full exit)
        const realizedPnL = Number((shortQty * (currentAvg - executionPrice)).toFixed(2));
        const marginReleased = Number((shortQty * currentAvg).toFixed(2));
        const netCashReturn = Number((marginReleased + realizedPnL).toFixed(2));

        funds.availableCash = Number((funds.availableCash + netCashReturn).toFixed(2));
        funds.availableMargin = Number((funds.availableMargin + netCashReturn).toFixed(2));
        funds.usedMargin = Math.max(0, Number((funds.usedMargin - marginReleased).toFixed(2)));
        funds.updatedAt = new Date();
        await funds.save({ session });

        await PositionsModel.deleteOne({ _id: position._id }).session(session);

        return {
          success: true,
          state: "CLOSE_SHORT",
          realizedPnL,
          position: null,
        };
      } else {
        // State 10: Short-to-Long Reversal (tradeQty > shortQty)
        const coverQty = shortQty;
        const longQty = tradeQty - shortQty;

        const realizedPnL = Number((coverQty * (currentAvg - executionPrice)).toFixed(2));
        const marginReleased = Number((coverQty * currentAvg).toFixed(2));
        const cashFromCover = Number((marginReleased + realizedPnL).toFixed(2));
        const marginRequiredForLong = Number((longQty * executionPrice).toFixed(2));

        const effectiveAvailableCash = Number((funds.availableCash + cashFromCover).toFixed(2));
        if (effectiveAvailableCash < marginRequiredForLong) {
          return {
            success: false,
            rejectionReason: `Insufficient virtual funds for Short-to-Long reversal. Required for long leg: ₹${marginRequiredForLong.toLocaleString(undefined, { minimumFractionDigits: 2 })}, Effective Available: ₹${effectiveAvailableCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
          };
        }

        funds.availableCash = Number((effectiveAvailableCash - marginRequiredForLong).toFixed(2));
        funds.availableMargin = Number((funds.availableMargin + cashFromCover - marginRequiredForLong).toFixed(2));
        funds.usedMargin = Math.max(0, Number((funds.usedMargin - marginReleased + marginRequiredForLong).toFixed(2)));
        funds.updatedAt = new Date();
        await funds.save({ session });

        position.qty = longQty;
        position.avg = executionPrice;
        position.price = executionPrice;
        position.net = "+0.00%";
        position.isLoss = false;
        await position.save({ session });

        return {
          success: true,
          state: "REVERSAL_SHORT_TO_LONG",
          realizedPnL,
          position,
        };
      }
    }
  }
};

/**
 * Execute or reject an order with server-authoritative validation,
 * proper separation of marketPrice, limitPrice, and executionPrice,
 * standard LIMIT order execution rules, and complete MIS 10-state accounting.
 */
const processOrder = async ({
  userId = "demo_user",
  name,
  qty,
  price = null,
  marketPrice = null,
  mode = "BUY",
  product = "CNC",
  orderType = "MARKET",
  limitPrice = null,
  idempotencyKey = null,
}) => {
  // 1. User-Scoped Idempotency Check
  const effectiveUserId = String(userId || "demo_user");
  const cacheKey = idempotencyKey ? `${effectiveUserId}:${idempotencyKey}` : null;

  if (cacheKey) {
    if (idempotencyCache.has(cacheKey)) {
      const cached = idempotencyCache.get(cacheKey);
      return { ...cached, isDuplicate: true };
    }
    const existingOrder = await OrdersModel.findOne({ userId: effectiveUserId, idempotencyKey });
    if (existingOrder) {
      const result = {
        success: existingOrder.status === "FILLED" || existingOrder.status === "PENDING",
        status: existingOrder.status,
        message: `Order was already submitted (${existingOrder.status})`,
        order: existingOrder,
        isDuplicate: true,
      };
      idempotencyCache.set(cacheKey, result);
      return result;
    }
  }

  // 2. Strict Input Parameter Validations
  const numQty = Number(qty);
  const numLimitPrice = limitPrice !== null && limitPrice !== undefined ? Number(limitPrice) : null;
  const upperMode = String(mode).toUpperCase();
  const upperProduct = String(product).toUpperCase();
  const upperOrderType = String(orderType).toUpperCase();
  const symbol = String(name || "").toUpperCase().trim();

  if (!symbol) {
    return { success: false, status: "REJECTED", message: "Stock symbol is required" };
  }
  if (!Number.isFinite(numQty) || !Number.isInteger(numQty) || numQty <= 0) {
    return { success: false, status: "REJECTED", message: "Quantity must be a positive integer greater than 0" };
  }
  if (!["BUY", "SELL"].includes(upperMode)) {
    return { success: false, status: "REJECTED", message: "Order mode must be BUY or SELL" };
  }
  if (!["CNC", "MIS"].includes(upperProduct)) {
    return { success: false, status: "REJECTED", message: "Product must be CNC or MIS" };
  }
  if (!["MARKET", "LIMIT"].includes(upperOrderType)) {
    return { success: false, status: "REJECTED", message: "Order type must be MARKET or LIMIT" };
  }
  if (upperOrderType === "LIMIT" && (numLimitPrice === null || !Number.isFinite(numLimitPrice) || numLimitPrice <= 0)) {
    return { success: false, status: "REJECTED", message: "Limit orders require a valid limit price greater than 0" };
  }

  // 3. Determine Server-Authoritative Market Price
  const trustedMarketPrice = tickerService.getMarketPrice(symbol, marketPrice || price);
  if (!trustedMarketPrice || !Number.isFinite(trustedMarketPrice) || trustedMarketPrice <= 0) {
    return { success: false, status: "REJECTED", message: `Unable to obtain trusted market price for ${symbol}` };
  }

  // Brokerage single-price simulation: Ask = LTP, Bid = LTP
  const currentMarketAsk = trustedMarketPrice;
  const currentMarketBid = trustedMarketPrice;

  // 4. Determine Immediate vs. Pending Execution Eligibility
  let orderStatus = "FILLED";
  let executionPrice = null;
  let rejectionReason = null;

  if (upperOrderType === "MARKET") {
    orderStatus = "FILLED";
    executionPrice = upperMode === "BUY" ? currentMarketAsk : currentMarketBid;
  } else if (upperOrderType === "LIMIT") {
    if (upperMode === "BUY") {
      if (currentMarketAsk <= numLimitPrice) {
        orderStatus = "FILLED";
        executionPrice = currentMarketAsk;
      } else {
        orderStatus = "PENDING";
        executionPrice = null;
      }
    } else if (upperMode === "SELL") {
      if (currentMarketBid >= numLimitPrice) {
        orderStatus = "FILLED";
        executionPrice = currentMarketBid;
      } else {
        orderStatus = "PENDING";
        executionPrice = null;
      }
    }
  }

  // Acquire user mutex lock for concurrency control & financial consistency
  await acquireUserLock(effectiveUserId);

  try {
    const orderResult = await withTransaction(async (session) => {
      const funds = await getOrCreateUserFunds(effectiveUserId, session);

      // ==========================================
      // CNC PRODUCT EXECUTION & RESERVATION
      // ==========================================
      if (upperProduct === "CNC") {
        if (upperMode === "BUY") {
          const requiredCapital = orderStatus === "FILLED"
            ? Number((executionPrice * numQty).toFixed(2))
            : Number((numLimitPrice * numQty).toFixed(2));

          if (funds.availableCash < requiredCapital) {
            orderStatus = "REJECTED";
            rejectionReason = `Insufficient virtual funds. Required: ₹${requiredCapital.toLocaleString(undefined, { minimumFractionDigits: 2 })}, Available: ₹${funds.availableCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
          } else {
            funds.availableCash = Number((funds.availableCash - requiredCapital).toFixed(2));
            funds.availableMargin = Number((funds.availableMargin - requiredCapital).toFixed(2));
            funds.usedMargin = Number((funds.usedMargin + requiredCapital).toFixed(2));
            funds.deliveryMargin = Number((funds.deliveryMargin + requiredCapital).toFixed(2));
            funds.updatedAt = new Date();
            await funds.save({ session });

            if (orderStatus === "FILLED") {
              const holdingQuery = HoldingsModel.findOne({ userId: effectiveUserId, name: symbol });
              if (session) holdingQuery.session(session);
              let holding = await holdingQuery;

              if (holding) {
                const oldQty = holding.qty;
                const oldAvg = holding.avg;
                const newQty = oldQty + numQty;
                const newAvg = Number(((oldAvg * oldQty + executionPrice * numQty) / newQty).toFixed(2));
                holding.qty = newQty;
                holding.avg = newAvg;
                holding.price = executionPrice;
                const netPct = (((executionPrice - newAvg) / newAvg) * 100).toFixed(2);
                holding.net = (netPct >= 0 ? "+" : "") + netPct + "%";
                await holding.save({ session });
              } else {
                await HoldingsModel.create(
                  [
                    {
                      userId: effectiveUserId,
                      name: symbol,
                      qty: numQty,
                      lockedQty: 0,
                      avg: executionPrice,
                      price: executionPrice,
                      net: "+0.00%",
                      day: "+0.00%",
                    },
                  ],
                  session ? { session } : {}
                );
              }
            }
          }
        } else if (upperMode === "SELL") {
          const holdingQuery = HoldingsModel.findOne({ userId: effectiveUserId, name: symbol });
          if (session) holdingQuery.session(session);
          const holding = await holdingQuery;

          const ownedQty = holding ? holding.qty : 0;
          const lockedQty = holding ? (holding.lockedQty || 0) : 0;
          const availableQty = Math.max(0, ownedQty - lockedQty);

          if (availableQty < numQty) {
            orderStatus = "REJECTED";
            rejectionReason = `Insufficient holdings to sell. Owned: ${ownedQty}, Locked in pending orders: ${lockedQty}, Available: ${availableQty}, Attempted: ${numQty}.`;
          } else {
            if (orderStatus === "PENDING") {
              holding.lockedQty = lockedQty + numQty;
              await holding.save({ session });
            } else if (orderStatus === "FILLED") {
              const proceeds = Number((executionPrice * numQty).toFixed(2));
              holding.qty = holding.qty - numQty;
              if (holding.qty <= 0) {
                await HoldingsModel.deleteOne({ _id: holding._id }).session(session);
              } else {
                await holding.save({ session });
              }

              funds.availableCash = Number((funds.availableCash + proceeds).toFixed(2));
              funds.availableMargin = Number((funds.availableMargin + proceeds).toFixed(2));
              funds.usedMargin = Math.max(0, Number((funds.usedMargin - proceeds).toFixed(2)));
              funds.deliveryMargin = Math.max(0, Number((funds.deliveryMargin - proceeds).toFixed(2)));
              funds.updatedAt = new Date();
              await funds.save({ session });
            }
          }
        }
      }

      // ==========================================
      // MIS (INTRADAY) PRODUCT EXECUTION & RESERVATION
      // ==========================================
      if (upperProduct === "MIS") {
        if (orderStatus === "FILLED") {
          const settleResult = await settleMISPosition({
            userId: effectiveUserId,
            symbol,
            tradeQty: numQty,
            tradeMode: upperMode,
            executionPrice,
            funds,
            session,
          });

          if (!settleResult.success) {
            orderStatus = "REJECTED";
            rejectionReason = settleResult.rejectionReason;
          }
        } else if (orderStatus === "PENDING") {
          // Reserve margin or lock position for pending MIS order
          const positionQuery = PositionsModel.findOne({ userId: effectiveUserId, name: symbol, product: "MIS" });
          if (session) positionQuery.session(session);
          const position = await positionQuery;

          if (upperMode === "SELL") {
            const ownedLongQty = position && position.qty > 0 ? position.qty : 0;
            const lockedLongQty = position ? (position.lockedQty || 0) : 0;
            const availableLongQty = Math.max(0, ownedLongQty - lockedLongQty);

            if (availableLongQty >= numQty) {
              // Selling existing long: lock shares to prevent overselling
              position.lockedQty = lockedLongQty + numQty;
              await position.save({ session });
            } else {
              // Short sell or partial reversal: requires margin reservation
              const requiredMargin = Number((numLimitPrice * numQty).toFixed(2));
              if (funds.availableCash < requiredMargin) {
                orderStatus = "REJECTED";
                rejectionReason = `Insufficient virtual funds to place pending MIS Short order. Required: ₹${requiredMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}, Available: ₹${funds.availableCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
              } else {
                funds.availableCash = Number((funds.availableCash - requiredMargin).toFixed(2));
                funds.availableMargin = Number((funds.availableMargin - requiredMargin).toFixed(2));
                funds.usedMargin = Number((funds.usedMargin + requiredMargin).toFixed(2));
                funds.updatedAt = new Date();
                await funds.save({ session });
              }
            }
          } else if (upperMode === "BUY") {
            // Pending BUY order: reserve limitPrice * qty
            const requiredMargin = Number((numLimitPrice * numQty).toFixed(2));
            if (funds.availableCash < requiredMargin) {
              orderStatus = "REJECTED";
              rejectionReason = `Insufficient virtual funds to place pending MIS Buy order. Required: ₹${requiredMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}, Available: ₹${funds.availableCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            } else {
              funds.availableCash = Number((funds.availableCash - requiredMargin).toFixed(2));
              funds.availableMargin = Number((funds.availableMargin - requiredMargin).toFixed(2));
              funds.usedMargin = Number((funds.usedMargin + requiredMargin).toFixed(2));
              funds.updatedAt = new Date();
              await funds.save({ session });
            }
          }
        }
      }

      // 5. Create Order Document
      const finalStoredPrice = orderStatus === "FILLED"
        ? executionPrice
        : (numLimitPrice || trustedMarketPrice);

      const createdOrders = await OrdersModel.create(
        [
          {
            userId: effectiveUserId,
            name: symbol,
            qty: numQty,
            price: finalStoredPrice,
            executionPrice: orderStatus === "FILLED" ? executionPrice : null,
            orderType: upperOrderType,
            limitPrice: upperOrderType === "LIMIT" ? numLimitPrice : null,
            product: upperProduct,
            mode: upperMode,
            status: orderStatus,
            rejectionReason,
            idempotencyKey,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        session ? { session } : {}
      );

      const newOrder = createdOrders[0];

      return {
        success: orderStatus === "FILLED" || orderStatus === "PENDING",
        status: orderStatus,
        message:
          orderStatus === "FILLED"
            ? `Order FILLED: ${upperMode} ${numQty} ${symbol} @ ₹${executionPrice.toFixed(2)}${upperOrderType === "LIMIT" ? ` (Limit: ₹${numLimitPrice.toFixed(2)})` : ""}`
            : orderStatus === "PENDING"
            ? `Order PENDING: Limit ${upperMode} ${numQty} ${symbol} set at ₹${numLimitPrice.toFixed(2)} (Market: ₹${trustedMarketPrice.toFixed(2)})`
            : `Order REJECTED: ${rejectionReason}`,
        rejectionReason,
        order: newOrder,
        marketPrice: trustedMarketPrice,
        executionPrice,
      };
    });

    if (cacheKey) {
      idempotencyCache.set(cacheKey, orderResult);
      setTimeout(() => idempotencyCache.delete(cacheKey), 60000);
    }

    return orderResult;
  } finally {
    releaseUserLock(effectiveUserId);
  }
};

/**
 * Cancel a pending order atomically and release reserved capital or shares.
 * Uses atomic findOneAndUpdate conditional transition to eliminate race conditions with the matching engine.
 */
const cancelOrder = async (orderId, userId = "demo_user") => {
  const effectiveUserId = String(userId || "demo_user");

  // 1. Atomic status transition: PENDING -> CANCELLED
  const order = await OrdersModel.findOneAndUpdate(
    { _id: orderId, userId: effectiveUserId, status: "PENDING" },
    { $set: { status: "CANCELLED", updatedAt: new Date() } },
    { returnDocument: "before" }
  );

  if (!order) {
    return { success: false, message: "Order not found or is no longer in PENDING status" };
  }

  await acquireUserLock(effectiveUserId);
  try {
    await withTransaction(async (session) => {
      const funds = await getOrCreateUserFunds(effectiveUserId, session);

      // Release reserved funds if BUY order
      if (order.mode === "BUY") {
        const reservedCost = Number(((order.limitPrice || order.price) * order.qty).toFixed(2));
        funds.availableCash = Number((funds.availableCash + reservedCost).toFixed(2));
        funds.availableMargin = Number((funds.availableMargin + reservedCost).toFixed(2));
        funds.usedMargin = Math.max(0, Number((funds.usedMargin - reservedCost).toFixed(2)));
        if (order.product === "CNC") {
          funds.deliveryMargin = Math.max(0, Number((funds.deliveryMargin - reservedCost).toFixed(2)));
        }
        funds.updatedAt = new Date();
        await funds.save({ session });
      }

      // Release reserved/locked shares or funds if SELL order
      if (order.mode === "SELL") {
        if (order.product === "CNC") {
          const holdingQuery = HoldingsModel.findOne({ userId: effectiveUserId, name: order.name });
          if (session) holdingQuery.session(session);
          const holding = await holdingQuery;
          if (holding) {
            holding.lockedQty = Math.max(0, (holding.lockedQty || 0) - order.qty);
            await holding.save({ session });
          }
        } else {
          // MIS SELL
          const posQuery = PositionsModel.findOne({ userId: effectiveUserId, name: order.name, product: "MIS" });
          if (session) posQuery.session(session);
          const position = await posQuery;
          if (position && position.lockedQty > 0) {
            position.lockedQty = Math.max(0, position.lockedQty - order.qty);
            await position.save({ session });
          } else {
            // Margin was reserved for short sell
            const reservedCost = Number(((order.limitPrice || order.price) * order.qty).toFixed(2));
            funds.availableCash = Number((funds.availableCash + reservedCost).toFixed(2));
            funds.availableMargin = Number((funds.availableMargin + reservedCost).toFixed(2));
            funds.usedMargin = Math.max(0, Number((funds.usedMargin - reservedCost).toFixed(2)));
            funds.updatedAt = new Date();
            await funds.save({ session });
          }
        }
      }
    });

    return {
      success: true,
      message: `Order #${order._id.toString().slice(-6)} CANCELLED successfully. Reserved assets restored.`,
      order,
    };
  } finally {
    releaseUserLock(effectiveUserId);
  }
};

/**
 * Executes a single pending order against current market price with atomic conditional state transition.
 * Guarantees that the same order can never execute more than once.
 */
const executeMatchingOrder = async (orderId, marketPrice, io = globalIo, broadcastUserUpdates = globalBroadcastUserUpdates) => {
  // 1. Atomic claim: PENDING -> EXECUTING
  const order = await OrdersModel.findOneAndUpdate(
    { _id: orderId, status: "PENDING" },
    { $set: { status: "EXECUTING", updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!order) {
    return { success: false, reason: "ORDER_NOT_PENDING" };
  }

  const userId = order.userId;
  await acquireUserLock(userId);

  try {
    const executionPrice = Number(Number(marketPrice).toFixed(2));
    const qty = order.qty;
    const limitPrice = Number(order.limitPrice || order.price);

    await withTransaction(async (session) => {
      const funds = await getOrCreateUserFunds(userId, session);

      if (order.product === "CNC") {
        if (order.mode === "BUY") {
          const reservedCost = Number((limitPrice * qty).toFixed(2));
          const actualCost = Number((executionPrice * qty).toFixed(2));
          const refund = Number((reservedCost - actualCost).toFixed(2));

          if (refund > 0) {
            funds.availableCash = Number((funds.availableCash + refund).toFixed(2));
            funds.availableMargin = Number((funds.availableMargin + refund).toFixed(2));
          }
          funds.usedMargin = Math.max(0, Number((funds.usedMargin - refund).toFixed(2)));
          funds.deliveryMargin = Math.max(0, Number((funds.deliveryMargin - refund).toFixed(2)));
          funds.updatedAt = new Date();
          await funds.save({ session });

          const holdingQuery = HoldingsModel.findOne({ userId, name: order.name });
          if (session) holdingQuery.session(session);
          let holding = await holdingQuery;

          if (holding) {
            const oldQty = holding.qty;
            const oldAvg = holding.avg;
            const newQty = oldQty + qty;
            const newAvg = Number(((oldAvg * oldQty + executionPrice * qty) / newQty).toFixed(2));
            holding.qty = newQty;
            holding.avg = newAvg;
            holding.price = executionPrice;
            const netPct = (((executionPrice - newAvg) / newAvg) * 100).toFixed(2);
            holding.net = (netPct >= 0 ? "+" : "") + netPct + "%";
            await holding.save({ session });
          } else {
            await HoldingsModel.create(
              [
                {
                  userId,
                  name: order.name,
                  qty,
                  lockedQty: 0,
                  avg: executionPrice,
                  price: executionPrice,
                  net: "+0.00%",
                  day: "+0.00%",
                },
              ],
              session ? { session } : {}
            );
          }
        } else if (order.mode === "SELL") {
          const proceeds = Number((executionPrice * qty).toFixed(2));

          const holdingQuery = HoldingsModel.findOne({ userId, name: order.name });
          if (session) holdingQuery.session(session);
          let holding = await holdingQuery;

          if (holding) {
            holding.lockedQty = Math.max(0, (holding.lockedQty || 0) - qty);
            holding.qty = Math.max(0, holding.qty - qty);
            if (holding.qty <= 0) {
              await HoldingsModel.deleteOne({ _id: holding._id }).session(session);
            } else {
              await holding.save({ session });
            }
          }

          funds.availableCash = Number((funds.availableCash + proceeds).toFixed(2));
          funds.availableMargin = Number((funds.availableMargin + proceeds).toFixed(2));
          funds.updatedAt = new Date();
          await funds.save({ session });
        }
      } else if (order.product === "MIS") {
        // First restore reserved margin if any so settleMISPosition operates cleanly
        if (order.mode === "BUY") {
          const reservedCost = Number((limitPrice * qty).toFixed(2));
          funds.availableCash = Number((funds.availableCash + reservedCost).toFixed(2));
          funds.availableMargin = Number((funds.availableMargin + reservedCost).toFixed(2));
          funds.usedMargin = Math.max(0, Number((funds.usedMargin - reservedCost).toFixed(2)));
        } else if (order.mode === "SELL") {
          const posQuery = PositionsModel.findOne({ userId, name: order.name, product: "MIS" });
          if (session) posQuery.session(session);
          const position = await posQuery;
          if (position && position.lockedQty > 0) {
            position.lockedQty = Math.max(0, position.lockedQty - qty);
            await position.save({ session });
          } else {
            const reservedCost = Number((limitPrice * qty).toFixed(2));
            funds.availableCash = Number((funds.availableCash + reservedCost).toFixed(2));
            funds.availableMargin = Number((funds.availableMargin + reservedCost).toFixed(2));
            funds.usedMargin = Math.max(0, Number((funds.usedMargin - reservedCost).toFixed(2)));
          }
        }

        // Apply clean MIS settlement
        await settleMISPosition({
          userId,
          symbol: order.name,
          tradeQty: qty,
          tradeMode: order.mode,
          executionPrice,
          funds,
          session,
        });
      }

      // Update Order to FILLED
      order.status = "FILLED";
      order.price = executionPrice;
      order.executionPrice = executionPrice;
      order.updatedAt = new Date();
      await order.save({ session });
    });

    // Broadcast real-time state updates to user
    if (broadcastUserUpdates) {
      await broadcastUserUpdates(userId);
    }
    if (io) {
      io.to(`user_${userId}`).emit("order_executed", {
        orderId: order._id,
        symbol: order.name,
        mode: order.mode,
        qty: order.qty,
        executionPrice,
        status: "FILLED",
      });
    }

    return { success: true, order, executionPrice };
  } catch (err) {
    // If error occurs, revert status back to PENDING
    order.status = "PENDING";
    await order.save();
    throw err;
  } finally {
    releaseUserLock(userId);
  }
};

/**
 * Match all pending LIMIT orders for a given stock against its new market price.
 */
const matchPendingOrdersForStock = async (
  rawSymbol,
  marketPrice,
  io = globalIo,
  broadcastUserUpdates = globalBroadcastUserUpdates
) => {
  const symbol = String(rawSymbol).toUpperCase().trim();
  const price = Number(Number(marketPrice).toFixed(2));
  if (!Number.isFinite(price) || price <= 0) return [];

  const pendingOrders = await OrdersModel.find({
    name: symbol,
    status: "PENDING",
    orderType: "LIMIT",
  });

  const executedResults = [];

  for (const pendingOrder of pendingOrders) {
    const limit = Number(pendingOrder.limitPrice || pendingOrder.price);
    let isEligible = false;

    if (pendingOrder.mode === "BUY" && price <= limit) {
      isEligible = true;
    } else if (pendingOrder.mode === "SELL" && price >= limit) {
      isEligible = true;
    }

    if (isEligible) {
      try {
        const execResult = await executeMatchingOrder(pendingOrder._id, price, io, broadcastUserUpdates);
        if (execResult && execResult.success) {
          executedResults.push(execResult);
        }
      } catch (err) {
        console.error(`[MatchingEngine] Execution failed for order ${pendingOrder._id}:`, err);
      }
    }
  }

  return executedResults;
};

/**
 * Sweep through all pending orders and match them against current market quotes.
 */
const matchAllPendingOrders = async (
  io = globalIo,
  broadcastUserUpdates = globalBroadcastUserUpdates
) => {
  const pendingSymbols = await OrdersModel.distinct("name", { status: "PENDING", orderType: "LIMIT" });
  const allResults = [];

  for (const sym of pendingSymbols) {
    const price = tickerService.getMarketPrice(sym);
    if (price && Number.isFinite(price) && price > 0) {
      const results = await matchPendingOrdersForStock(sym, price, io, broadcastUserUpdates);
      allResults.push(...results);
    }
  }

  return allResults;
};

module.exports = {
  processOrder,
  cancelOrder,
  executeMatchingOrder,
  matchPendingOrdersForStock,
  matchAllPendingOrders,
  getOrCreateUserFunds,
  setOrderExecutionDependencies,
  settleMISPosition,
  acquireUserLock,
  releaseUserLock,
};
