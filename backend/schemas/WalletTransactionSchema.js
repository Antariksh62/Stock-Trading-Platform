const { Schema } = require("mongoose");

const WalletTransactionSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    paymentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    razorpayRefundId: {
      type: String,
      default: null,
      index: true,
    },
    referencePaymentId: {
      type: String,
      default: null,
    },
    razorpayOrderId: {
      type: String,
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: ["DEPOSIT", "WITHDRAWAL", "REFUND", "ADJUSTMENT"],
      default: "DEPOSIT",
      required: true,
    },
    transactionType: {
      type: String,
      default: "DEPOSIT",
    },
    amount: {
      type: Number,
      required: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: "Wallet transaction amount must be an integer in paise",
      },
      min: [1, "Amount must be at least 1 paise"],
    },
    amountRupees: {
      type: Number,
      required: true,
      min: [0.01, "Amount in rupees must be positive"],
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    balanceBefore: {
      type: Number,
      default: 0.0,
    },
    balanceBeforeRupees: {
      type: Number,
      default: 0.0,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    balanceAfterRupees: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["COMPLETED", "SUCCESS", "FAILED"],
      default: "COMPLETED",
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-validate hook for field compatibility
WalletTransactionSchema.pre("validate", function () {
  if (this.type && !this.transactionType) {
    this.transactionType = this.type;
  }
  if (this.transactionType && !this.type) {
    this.type = this.transactionType;
  }
  if (this.amountPaise && !this.amount) {
    this.amount = this.amountPaise;
  }
  if (this.amount && !this.amountPaise) {
    this.amountPaise = Math.round(this.amount);
  }
  if (this.amountRupees === undefined && this.amountPaise) {
    this.amountRupees = this.amountPaise / 100;
  }
  if (this.balanceBefore !== undefined && this.balanceBeforeRupees === undefined) {
    this.balanceBeforeRupees = this.balanceBefore;
  }
  if (this.balanceAfter !== undefined && this.balanceAfterRupees === undefined) {
    this.balanceAfterRupees = this.balanceAfter;
  }
});

// Compound indexes
WalletTransactionSchema.index({ userId: 1, timestamp: -1 });
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
WalletTransactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
WalletTransactionSchema.index(
  { razorpayPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: { razorpayPaymentId: { $type: "string" } },
  }
);

module.exports = { WalletTransactionSchema };
