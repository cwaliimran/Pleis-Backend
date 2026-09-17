const mongoose = require("mongoose");

/**
 * Statement / payout batch (Payout Definition v5 §3).
 * Phase B: generate → download pain.001 → confirm (PAID) / cancel.
 * Do not execute live SEPA transfers — manual bank upload only.
 * Fiscalize / commission eRačun is Phase C — not triggered on confirm.
 *
 * Status: PENDING | PAID | CANCELLED (CANCELLED soft-deletes; period reopens).
 */

const payoutBatchSchema = new mongoose.Schema(
  {
    schemaVersion: { type: Number, default: 5 },
    batchReference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: [
        "PENDING",
        "PAID",
        "CANCELLED",
        "draft",
        "ready",
        "exported",
        "submitted",
        "settled",
        "failed",
      ],
      default: "PENDING",
      index: true,
    },
    currency: { type: String, default: "EUR" },
    totalAmountCents: { type: Number, default: 0 },
    organizerPayoutCents: { type: Number, default: 0 },
    organizerNetTotalCents: { type: Number, default: 0 },
    pleisNetCents: { type: Number, default: 0 },
    pleisNetTotalCents: { type: Number, default: 0 },
    gatewayCostCents: { type: Number, default: 0 },
    receivedTotalCents: { type: Number, default: 0 },
    lineCount: { type: Number, default: 0 },
    transactionCount: { type: Number, default: 0 },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    entryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "PaymentLedgerEntry" }],
    lines: { type: [mongoose.Schema.Types.Mixed], default: [] },
    lineBreakdown: { type: [mongoose.Schema.Types.Mixed], default: [] },
    entryBreakdown: { type: [mongoose.Schema.Types.Mixed], default: [] },
    incompleteOrganizers: { type: [mongoose.Schema.Types.Mixed], default: [] },
    promotedHeldCount: { type: Number, default: 0 },
    ratesSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    msgId: { type: String, default: "" },
    fileName: { type: String, default: "" },
    fileSequence: { type: Number, default: 0 },
    pain001Xml: { type: String, default: "" },
    pain001Hash: { type: String, default: "" },
    xmlHash: { type: String, default: "" },
    pain001StorageKey: { type: String, default: "" },
    exportedAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    generatedAt: { type: Date, default: null },
    audit: {
      type: [
        {
          action: String,
          actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          at: { type: Date, default: Date.now },
          detail: mongoose.Schema.Types.Mixed,
        },
      ],
      default: [],
    },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

payoutBatchSchema.index({ status: 1, createdAt: -1 });
payoutBatchSchema.index({ periodEnd: -1 });

module.exports = mongoose.model("PayoutBatch", payoutBatchSchema);
