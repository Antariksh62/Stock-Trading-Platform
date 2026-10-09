const { Schema } = require("mongoose");

const FundsSchema = new Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  availableMargin: {
    type: Number,
    default: 100000.0,
  },
  usedMargin: {
    type: Number,
    default: 0.0,
  },
  availableCash: {
    type: Number,
    default: 100000.0,
  },
  openingBalance: {
    type: Number,
    default: 100000.0,
  },
  payin: {
    type: Number,
    default: 0.0,
  },
  span: {
    type: Number,
    default: 0.0,
  },
  deliveryMargin: {
    type: Number,
    default: 0.0,
  },
  exposure: {
    type: Number,
    default: 0.0,
  },
  optionsPremium: {
    type: Number,
    default: 0.0,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = { FundsSchema };
