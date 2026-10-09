const { Schema } = require("mongoose");

const OrdersSchema = new Schema({
  userId: {
    type: String,
    default: "demo_user",
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  qty: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
    min: 0.01,
  },
  orderType: {
    type: String,
    enum: ["MARKET", "LIMIT"],
    default: "MARKET",
  },
  limitPrice: {
    type: Number,
    default: null,
  },
  product: {
    type: String,
    enum: ["CNC", "MIS"],
    default: "CNC",
  },
  mode: {
    type: String,
    enum: ["BUY", "SELL"],
    required: true,
  },
  status: {
    type: String,
    enum: ["PENDING", "FILLED", "CANCELLED", "REJECTED"],
    default: "FILLED",
    index: true,
  },
  rejectionReason: {
    type: String,
    default: null,
  },
  idempotencyKey: {
    type: String,
    default: null,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = { OrdersSchema };