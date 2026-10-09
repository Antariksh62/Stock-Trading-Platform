const { Schema } = require("mongoose");

const HoldingsSchema = new Schema({
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
    min: 0,
  },
  avg: {
    type: Number,
    required: true,
    min: 0,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  net: {
    type: String,
    default: "+0.00%",
  },
  day: {
    type: String,
    default: "+0.00%",
  },
});

module.exports = { HoldingsSchema };