const mongoose = require("mongoose");

/**
 * Payment ledger row (Payout Definition v5 §2.1 foundation).
 * Written idempotently on paid capture (orderId + module).
 *
 * Field naming: camelCase in Mongo (payoutStatus, statementId, …).
 * Doc equivalents: payout_status, statement_id, payout_paid_at,
 * fiscalization_status, fiscalized_at, gateway_cost.
 *
 * Tip split rates and unspent-voucher payout remain OPEN product decisions —
 * tipAmountCents is stored when present; do not invent organizer tip ownership.
 */
const PAYOUT_STATUSES = ["HELD", "PENDING", "PAID", "EXCLUDED"];
const FISCALIZATION_STATUSES = [
  "NOT_FISCALIZED",
  "FISCALIZED",
  "FISCALIZATION_FAILED",
];

const paymentLedgerEntrySchema = new mongoose.Schema(
  {
    schemaVersion: { type: Number, default: 5 },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    orderType: {
      type: String,
      enum: [
        "ticketingbookings",
        "userreservations",
        "menuorders",
        "subscription",
        "tickettransfer",
      ],
      required: true,
    },
    module: {
      type: String,
      enum: ["TICKETING", "ORDERING", "RESERVATION", "SUBSCRIPTION"],
      required: true,
    },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organizations" },
    companyOrganizer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    provider: { type: String, default: "monri" },
    providerTransactionId: { type: String, index: true },
    confirmationNumber: { type: String, index: true },
    /** Gross received from customer, integer minor units (cents). */
    amountCents: { type: Number, required: true },
    /** Ordering tip (napojnica) portion in cents; 0 if none. */
    tipAmountCents: { type: Number, default: 0 },
    /**
     * Gateway keeps 1% of received — Pleis cost, never organizer's.
     * gatewayCostCents = round(amountCents * 0.01). Stored for §4 foundation.
     */
    gatewayCostCents: { type: Number, default: 0 },
    currency: { type: String, default: "EUR" },
    paymentStatus: { type: String, required: true },
    paymentMethod: { type: String },
    cardLast4: { type: String, default: null },
    cardBrand: { type: String, default: null },
    /** Capture time (money received). Prefer over createdAt for statement periods. */
    capturedAt: { type: Date, default: Date.now },

    // --- Payout tracking (v5 §2.1) ---
    payoutStatus: {
      type: String,
      enum: PAYOUT_STATUSES,
      default: "PENDING",
      index: true,
    },
    /** FK to statement / PayoutBatch while PENDING or after PAID. */
    statementId: { type: String, default: null, index: true },
    payoutPaidAt: { type: Date, default: null },
    /** Legacy alias kept for early stub consumers; prefer statementId. */
    payoutBatchId: { type: String, default: null, index: true },

    // --- Fiscalize batch (v5 §3.6) — not run on statement confirm ---
    fiscalizationStatus: {
      type: String,
      enum: FISCALIZATION_STATUSES,
      default: "NOT_FISCALIZED",
      index: true,
    },
    fiscalizedAt: { type: Date, default: null },

    /**
     * Off-app track (Payout §3.7) — mutually exclusive with payout selection.
     * Cash / external POS: paymentChannel=offapp; never enters pain.001.
     */
    paymentChannel: {
      type: String,
      enum: ["pleis", "offapp"],
      default: "pleis",
      index: true,
    },
    offAppFiscalizationStatus: {
      type: String,
      enum: ["NOT_FISCALIZED", "FISCALIZED", "FISCALIZATION_FAILED"],
      default: undefined,
    },
    offAppBatchId: { type: String, default: null, index: true },

    excludedAt: { type: Date, default: null },
    excludedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    exclusionReason: { type: String, default: null },

    invoiceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "BillkoInvoice" }],
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

paymentLedgerEntrySchema.index({ organization: 1, createdAt: -1 });
paymentLedgerEntrySchema.index({ companyOrganizer: 1, createdAt: -1 });
paymentLedgerEntrySchema.index(
  { orderId: 1, module: 1 },
  { unique: true },
);
paymentLedgerEntrySchema.index({
  payoutStatus: 1,
  statementId: 1,
  capturedAt: -1,
});

module.exports = mongoose.model("PaymentLedgerEntry", paymentLedgerEntrySchema);
module.exports.PAYOUT_STATUSES = PAYOUT_STATUSES;
module.exports.FISCALIZATION_STATUSES = FISCALIZATION_STATUSES;
