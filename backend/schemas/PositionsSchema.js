const { Schema } = require("mongoose");

const PositionsSchema = new Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  product: {
    type: String,
    enum: ["MIS", "CNC", "NRML"],
    default: "MIS",
  },
  name: {
    type: String,
    required: true,
  },
  qty: {
    type: Number,
    required: true,
  },
  lockedQty: {
    type: Number,
    default: 0,
    min: 0,
  },
  avg: {
    type: Number,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  net: {
    type: String,
    default: "+0.00%",
  },
  day: {
    type: String,
    default: "+0.00%",
  },
  isLoss: {
    type: Boolean,
    default: false,
  },
});

module.exports = { PositionsSchema };