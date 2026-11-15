const mongoose = require("mongoose");
const { RefundSchema } = require("../schemas/RefundSchema");

const RefundModel =
  mongoose.models.refunds || mongoose.model("refunds", RefundSchema);

module.exports = { RefundModel };

