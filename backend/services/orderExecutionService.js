const { OrdersModel } = require("../model/OrdersModel");
const { HoldingsModel } = require("../model/HoldingsModel");
const { PositionsModel } = require("../model/PositionsModel");
const { FundsModel } = require("../model/FundsModel");

// In-memory idempotency cache (keyed by idempotencyKey -> orderResult, TTL 60s)
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

// Ensure user has a funds record initialized
const getOrCreateUserFunds = async (userId) => {
  let funds = await FundsModel.findOne({ userId });
  if (!funds) {
    funds = await FundsModel.create({
      userId,
      availableMargin: 100000.0,
      usedMargin: 0.0,
      availableCash: 100000.0,
      openingBalance: 100000.0,
      payin: 0.0,
      span: 0.0,
      deliveryMargin: 0.0,
      exposure: 0.0,
      optionsPremium: 0.0,
    });
  }
  return funds;
};

/**
 * Execute or reject an order with full server-authoritative validation
 */
const processOrder = async ({
  userId = "demo_user",
  name,
  qty,
  price,
  mode = "BUY",
  product = "CNC",
  orderType = "MARKET",
  limitPrice = null,
  idempotencyKey = null,
}) => {
  // 1. Idempotency Check
  if (idempotencyKey) {
    if (idempotencyCache.has(idempotencyKey)) {
      const cached = idempotencyCache.get(idempotencyKey);
      return { ...cached, isDuplicate: true };
    }
    // Also check DB for recent order with same idempotencyKey
    const existingOrder = await OrdersModel.findOne({ idempotencyKey });
    if (existingOrder) {
      const result = {
        success: existingOrder.status === "FILLED" || existingOrder.status === "PENDING",
        status: existingOrder.status,
        message: `Order was already submitted (${existingOrder.status})`,
        order: existingOrder,
        isDuplicate: true,
      };
      idempotencyCache.set(idempotencyKey, result);
      return result;
    }
  }

  // 2. Input Parameter Validations
  const numQty = Number(qty);
  const numPrice = Number(price);
  const numLimitPrice = limitPrice !== null ? Number(limitPrice) : null;
  const upperMode = String(mode).toUpperCase();
  const upperProduct = String(product).toUpperCase();
  const upperOrderType = String(orderType).toUpperCase();
  const symbol = String(name).toUpperCase().trim();

  if (!symbol) {
    return { success: false, status: "REJECTED", message: "Stock symbol is required" };
  }
  if (!Number.isInteger(numQty) || numQty <= 0) {
    return { success: false, status: "REJECTED", message: "Quantity must be a positive integer greater than 0" };
  }
  if (isNaN(numPrice) || numPrice <= 0) {
    return { success: false, status: "REJECTED", message: "Price must be a valid number greater than 0" };
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
  if (upperOrderType === "LIMIT" && (!numLimitPrice || numLimitPrice <= 0)) {
    return { success: false, status: "REJECTED", message: "Limit orders require a valid limit price > 0" };
  }

  // Acquire user lock for concurrency control
  await acquireUserLock(userId);

  try {
    const funds = await getOrCreateUserFunds(userId);
    const executionPrice = upperOrderType === "LIMIT" ? numLimitPrice : numPrice;
    const totalCost = Number((executionPrice * numQty).toFixed(2));

    let orderStatus = "FILLED";
    let rejectionReason = null;

    // Evaluate Limit Orders:
    // If BUY Limit and limitPrice < current market price -> set to PENDING
    // If SELL Limit and limitPrice > current market price -> set to PENDING
    if (upperOrderType === "LIMIT") {
      if (upperMode === "BUY" && numLimitPrice < numPrice) {
        orderStatus = "PENDING";
      } else if (upperMode === "SELL" && numLimitPrice > numPrice) {
        orderStatus = "PENDING";
      }
    }

    // --- BUY LOGIC ---
    if (upperMode === "BUY") {
      if (funds.availableCash < totalCost) {
        orderStatus = "REJECTED";
        rejectionReason = `Insufficient virtual funds. Required: ₹${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}, Available: ₹${funds.availableCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      } else {
        // Deduct available cash and available margin atomically
        funds.availableCash = Number((funds.availableCash - totalCost).toFixed(2));
        funds.availableMargin = Number((funds.availableMargin - totalCost).toFixed(2));
        funds.usedMargin = Number((funds.usedMargin + totalCost).toFixed(2));
        if (upperProduct === "CNC") {
          funds.deliveryMargin = Number((funds.deliveryMargin + totalCost).toFixed(2));
        }

        await funds.save();

        if (orderStatus === "FILLED") {
          if (upperProduct === "CNC") {
            // Update or Create Holding
            let holding = await HoldingsModel.findOne({ userId, name: symbol });
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
              await holding.save();
            } else {
              await HoldingsModel.create({
                userId,
                name: symbol,
                qty: numQty,
                avg: executionPrice,
                price: executionPrice,
                net: "+0.00%",
                day: "+0.00%",
              });
            }
          } else {
            // MIS Intraday Position
            let position = await PositionsModel.findOne({ userId, name: symbol, product: "MIS" });
            if (position) {
              const oldQty = position.qty;
              const oldAvg = position.avg;
              const newQty = oldQty + numQty;
              const newAvg = newQty > 0 ? Number(((oldAvg * oldQty + executionPrice * numQty) / newQty).toFixed(2)) : executionPrice;
              position.qty = newQty;
              position.avg = newAvg;
              position.price = executionPrice;
              await position.save();
            } else {
              await PositionsModel.create({
                userId,
                product: "MIS",
                name: symbol,
                qty: numQty,
                avg: executionPrice,
                price: executionPrice,
                net: "+0.00%",
                day: "+0.00%",
                isLoss: false,
              });
            }
          }
        }
      }
    }

    // --- SELL LOGIC ---
    if (upperMode === "SELL") {
      if (upperProduct === "CNC") {
        const holding = await HoldingsModel.findOne({ userId, name: symbol });
        const ownedQty = holding ? holding.qty : 0;

        if (ownedQty < numQty) {
          orderStatus = "REJECTED";
          rejectionReason = `Insufficient holdings to sell. You own ${ownedQty} shares of ${symbol}, attempted to sell ${numQty} shares`;
        } else {
          if (orderStatus === "FILLED") {
            const proceeds = totalCost;
            holding.qty = holding.qty - numQty;
            if (holding.qty === 0) {
              await HoldingsModel.deleteOne({ _id: holding._id });
            } else {
              await holding.save();
            }

            funds.availableCash = Number((funds.availableCash + proceeds).toFixed(2));
            funds.availableMargin = Number((funds.availableMargin + proceeds).toFixed(2));
            funds.usedMargin = Math.max(0, Number((funds.usedMargin - proceeds).toFixed(2)));
            funds.deliveryMargin = Math.max(0, Number((funds.deliveryMargin - proceeds).toFixed(2)));
            await funds.save();
          }
        }
      } else {
        // MIS Short / Sell
        if (orderStatus === "FILLED") {
          funds.availableCash = Number((funds.availableCash + totalCost).toFixed(2));
          funds.availableMargin = Number((funds.availableMargin + totalCost).toFixed(2));
          await funds.save();

          let position = await PositionsModel.findOne({ userId, name: symbol, product: "MIS" });
          if (position) {
            position.qty = position.qty - numQty;
            await position.save();
          } else {
            await PositionsModel.create({
              userId,
              product: "MIS",
              name: symbol,
              qty: -numQty,
              avg: executionPrice,
              price: executionPrice,
              net: "+0.00%",
              day: "+0.00%",
              isLoss: false,
            });
          }
        }
      }
    }

    // Create & Save Order Record
    const newOrder = await OrdersModel.create({
      userId,
      name: symbol,
      qty: numQty,
      price: executionPrice,
      orderType: upperOrderType,
      limitPrice: numLimitPrice,
      product: upperProduct,
      mode: upperMode,
      status: orderStatus,
      rejectionReason,
      idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = {
      success: orderStatus === "FILLED" || orderStatus === "PENDING",
      status: orderStatus,
      message:
        orderStatus === "FILLED"
          ? `Order FILLED: ${upperMode} ${numQty} ${symbol} @ ₹${executionPrice.toFixed(2)}`
          : orderStatus === "PENDING"
          ? `Order PENDING: Limit ${upperMode} ${numQty} ${symbol} set at ₹${executionPrice.toFixed(2)}`
          : `Order REJECTED: ${rejectionReason}`,
      rejectionReason,
      order: newOrder,
    };

    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, result);
      setTimeout(() => idempotencyCache.delete(idempotencyKey), 60000);
    }

    return result;
  } finally {
    releaseUserLock(userId);
  }
};

/**
 * Cancel a pending order and release reserved funds/assets
 */
const cancelOrder = async (orderId, userId = "demo_user") => {
  await acquireUserLock(userId);
  try {
    const order = await OrdersModel.findOne({ _id: orderId, userId });
    if (!order) {
      return { success: false, message: "Order not found" };
    }
    if (order.status !== "PENDING") {
      return { success: false, message: `Cannot cancel order with status '${order.status}'` };
    }

    order.status = "CANCELLED";
    order.updatedAt = new Date();
    await order.save();

    // Release reserved funds if BUY order
    if (order.mode === "BUY") {
      const funds = await getOrCreateUserFunds(userId);
      const reservedCost = Number((order.price * order.qty).toFixed(2));
      funds.availableCash = Number((funds.availableCash + reservedCost).toFixed(2));
      funds.availableMargin = Number((funds.availableMargin + reservedCost).toFixed(2));
      funds.usedMargin = Math.max(0, Number((funds.usedMargin - reservedCost).toFixed(2)));
      await funds.save();
    }

    return {
      success: true,
      message: `Order #${order._id.toString().slice(-6)} CANCELLED successfully`,
      order,
    };
  } finally {
    releaseUserLock(userId);
  }
};

module.exports = {
  processOrder,
  cancelOrder,
  getOrCreateUserFunds,
};
