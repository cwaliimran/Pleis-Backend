const mongoose = require("mongoose");

/**
 * Additive payout batch foundation (schema v5). No pain.001 generator yet.
 * Do not execute live SEPA transfers from this model.
 */
const payoutBatchSchema = new mongoose.Schema(
  {
    schemaVersion: { type: Number, default: 5 },
    batchReference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["draft", "ready", "exported", "submitted", "settled", "failed"],
      default: "draft",
    },
    currency: { type: String, default: "EUR" },
    totalAmountCents: { type: Number, default: 0 },
    entryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "PaymentLedgerEntry" }],
    pain001StorageKey: { type: String, default: "" },
    exportedAt: { type: Date, default: null },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("PayoutBatch", payoutBatchSchema);
