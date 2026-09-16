const mongoose = require("mongoose");

/**
 * Audit log for on-demand Fiscalize runs (Payout §3.6 / Billko §14.4).
 * Independent of statement confirm — selects PAID + NOT_FISCALIZED/FAILED.
 */
const fiscalizeRunSchema = new mongoose.Schema(
  {
    schemaVersion: { type: Number, default: 5 },
    runReference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["COMPLETED", "PARTIAL", "FAILED", "DRY_RUN"],
      default: "DRY_RUN",
    },
    liveBillko: { type: Boolean, default: false },
    selectedCount: { type: Number, default: 0 },
    fiscalizedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    skippedZeroCommissionCount: { type: Number, default: 0 },
    commissionInvoiceIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "BillkoInvoice" },
    ],
    organizerResults: { type: [mongoose.Schema.Types.Mixed], default: [] },
    entryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "PaymentLedgerEntry" }],
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

fiscalizeRunSchema.index({ createdAt: -1 });

module.exports = mongoose.model("FiscalizeRun", fiscalizeRunSchema);
