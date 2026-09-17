const mongoose = require("mongoose");

/**
 * Off-app fiscalization batch (Payout §3.7).
 * Cash / organizer-POS orders: no pain.001; commission eRačun on confirm.
 * Status: PENDING → CONFIRMED | CANCELLED.
 */
const offAppFiscalBatchSchema = new mongoose.Schema(
  {
    schemaVersion: { type: Number, default: 5 },
    batchReference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    currency: { type: String, default: "EUR" },
    orderGrossCents: { type: Number, default: 0 },
    commissionTotalCents: { type: Number, default: 0 },
    lineCount: { type: Number, default: 0 },
    entryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "PaymentLedgerEntry" }],
    organizerLines: { type: [mongoose.Schema.Types.Mixed], default: [] },
    commissionInvoiceIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "BillkoInvoice" },
    ],
    ratesSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
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

offAppFiscalBatchSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("OffAppFiscalBatch", offAppFiscalBatchSchema);
