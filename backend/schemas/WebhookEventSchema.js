const { Schema } = require("mongoose");

const WebhookEventSchema = new Schema(
  {
    razorpayEventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Backwards-compatible alias for razorpayEventId
    eventId: {
      type: String,
      default: null,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    razorpayOrderId: {
      type: String,
      default: null,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      index: true,
    },
    internalPaymentId: {
      type: String,
      default: null,
      index: true,
    },
    razorpayRefundId: {
      type: String,
      default: null,
      index: true,
    },
    internalRefundId: {
      type: String,
      default: null,
      index: true,
    },
    signatureVerified: {
      type: Boolean,
      default: true,
    },
    isDuplicate: {
      type: Boolean,
      default: false,
    },
    processingStatus: {
      type: String,
      enum: ["RECEIVED", "PROCESSING", "PROCESSED", "FAILED"],
      default: "RECEIVED",
      index: true,
    },
    // Backwards-compatible alias for processingStatus
    status: {
      type: String,
      default: "RECEIVED",
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastError: {
      type: String,
      default: null,
    },
    // Backwards-compatible alias for lastError
    errorDetails: {
      type: String,
      default: null,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to keep alias fields synchronized
WebhookEventSchema.pre("save", function () {
  if (this.razorpayEventId && !this.eventId) {
    this.eventId = this.razorpayEventId;
  }
  if (this.eventId && !this.razorpayEventId) {
    this.razorpayEventId = this.eventId;
  }
  if (this.processingStatus && this.status !== this.processingStatus) {
    this.status = this.processingStatus;
  }
  if (this.lastError && !this.errorDetails) {
    this.errorDetails = this.lastError;
  }
});

// Indexes for high-throughput webhook lookup and recovery
WebhookEventSchema.index({ processingStatus: 1, receivedAt: 1 });
WebhookEventSchema.index({ eventType: 1, processingStatus: 1 });
WebhookEventSchema.index({ razorpayOrderId: 1, eventType: 1 });

module.exports = { WebhookEventSchema };
