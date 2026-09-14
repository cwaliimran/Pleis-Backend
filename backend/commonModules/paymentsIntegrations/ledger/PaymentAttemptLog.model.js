const mongoose = require("mongoose");

/**
 * Additive attempt log (schema v5). Stores outcome + payload fingerprint only.
 * Never persist PAN / full raw callback.
 * Not wired into live payment paths yet.
 */
const paymentAttemptLogSchema = new mongoose.Schema(
  {
    schemaVersion: { type: Number, default: 5 },
    orderNumber: { type: String, required: true, index: true },
    orderType: { type: String },
    provider: { type: String, default: "monri" },
    status: { type: String, required: true },
    amountCents: { type: Number },
    currency: { type: String, default: "EUR" },
    payloadHash: { type: String, default: "" },
    errorCode: { type: String, default: "" },
    attemptedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

paymentAttemptLogSchema.index({ orderNumber: 1, attemptedAt: -1 });

module.exports = mongoose.model("PaymentAttemptLog", paymentAttemptLogSchema);
