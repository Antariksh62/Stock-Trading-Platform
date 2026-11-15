const { Schema } = require("mongoose");

const PaymentSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    internalPaymentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: "Payment amount must be an integer in paise",
      },
      min: [100, "Minimum amount is 100 paise (₹1)"],
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["CREATED", "PENDING", "CAPTURED", "CREDITED", "FAILED"],
      default: "CREATED",
      index: true,
    },
    method: {
      type: String,
      default: null,
      trim: true,
    },
    failureReason: {
      type: String,
      default: null,
    },
    idempotencyKey: {
      type: String,
      trim: true,
    },
    capturedAt: {
      type: Date,
      default: null,
    },
    creditedAt: {
      type: Date,
      default: null,
    },
    walletTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "wallet_transaction",
      default: null,
    },
    reconciliationStatus: {
      type: String,
      enum: ["UNRECONCILED", "RECONCILED", "FLAGGED", "FAILED"],
      default: "UNRECONCILED",
      index: true,
    },
    reconciledAt: {
      type: Date,
      default: null,
    },
    reconciliationAttempts: {
      type: Number,
      default: 0,
    },
    reconciliationLastChecked: {
      type: Date,
      default: null,
    },
    reconciliationLockedUntil: {
      type: Date,
      default: null,
      index: true,
    },
    reconciliationNotes: {
      type: String,
      default: null,
    },
    amountRefunded: {
      type: Number,
      default: 0,
      min: [0, "Amount refunded cannot be negative"],
    },
    refundStatus: {
      type: String,
      enum: ["NONE", "PARTIAL", "FULL"],
      default: "NONE",
      index: true,
    },
    refunds: [
      {
        refundId: {
          type: String,
          required: true,
        },
        razorpayRefundId: {
          type: String,
          default: null,
        },
        amount: {
          type: Number,
          required: true,
          min: [1, "Refund amount must be at least 1 paise"],
        },
        amountRupees: {
          type: Number,
        },
        currency: {
          type: String,
          default: "INR",
        },
        status: {
          type: String,
          enum: ["PENDING", "PROCESSED", "FAILED"],
          default: "PENDING",
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
        idempotencyKey: {
          type: String,
          default: null,
        },
        failureReason: {
          type: String,
          default: null,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        processedAt: {
          type: Date,
          default: null,
        },
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for user query and reconciliation performance
PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, createdAt: 1, reconciliationStatus: 1 });
PaymentSchema.index({ "refunds.razorpayRefundId": 1 }, { sparse: true });
PaymentSchema.index({ "refunds.refundId": 1 }, { sparse: true });
PaymentSchema.index(
  { userId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);

module.exports = { PaymentSchema };

