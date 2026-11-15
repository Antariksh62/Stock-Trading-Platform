const { Schema } = require("mongoose");

const RefundSchema = new Schema(
  {
    refundId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paymentId: {
      type: String,
      required: true,
      index: true,
    },
    internalPaymentId: {
      type: String,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      required: true,
      index: true,
    },
    razorpayRefundId: {
      type: String,
      default: null,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: "Refund amount must be an integer in paise",
      },
      min: [1, "Refund amount must be at least 1 paise"],
    },
    amountRupees: {
      type: Number,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSED", "FAILED"],
      default: "PENDING",
      index: true,
    },
    speed: {
      type: String,
      default: "normal",
    },
    reason: {
      type: String,
      default: null,
    },
    notes: {
      type: Schema.Types.Mixed,
      default: {},
    },
    initiatedBy: {
      type: String,
      default: "USER",
    },
    walletDeductionStatus: {
      type: String,
      enum: [
        "NOT_APPLICABLE",
        "PENDING",
        "DEDUCTED",
        "INSUFFICIENT_FUNDS",
        "SKIPPED_UNCREDITED",
        "UNTOUCHED",
        "ROLLED_BACK",
      ],
      default: "NOT_APPLICABLE",
    },
    walletTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "wallet_transaction",
      default: null,
    },
    walletReversalNotes: {
      type: String,
      default: null,
    },
    reconciled: {
      type: Boolean,
      default: false,
    },
    reconciliationStatus: {
      type: String,
      enum: ["UNRECONCILED", "RECONCILED", "FLAGGED", "FAILED"],
      default: "UNRECONCILED",
      index: true,
    },
    reconciliationAttempts: {
      type: Number,
      default: 0,
    },
    reconciliationLastChecked: {
      type: Date,
      default: null,
    },
    reconciliationNotes: {
      type: String,
      default: null,
    },
    isGatewayUncertain: {
      type: Boolean,
      default: false,
    },
    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
    },
    failureReason: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Database-level compound unique index on { paymentId, idempotencyKey }
// Partial filter ensures null or non-string idempotency keys do not collide
RefundSchema.index(
  { paymentId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);

// Sparse unique index on razorpayRefundId
RefundSchema.index(
  { razorpayRefundId: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { razorpayRefundId: { $type: "string" } },
  }
);

module.exports = { RefundSchema };
