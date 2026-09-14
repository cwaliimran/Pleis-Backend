const mongoose = require("mongoose");

/**
 * Additive payment logging schema (v5 foundation).
 * Not yet written from live webhook/fulfill paths — wire after schema review.
 * Tip split and unspent voucher remain OPEN; do not invent values.
 */
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
    },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organizations" },
    companyOrganizer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    provider: { type: String, default: "monri" },
    providerTransactionId: { type: String, index: true },
    confirmationNumber: { type: String, index: true },
    amountCents: { type: Number, required: true },
    currency: { type: String, default: "EUR" },
    paymentStatus: { type: String, required: true },
    paymentMethod: { type: String },
    cardLast4: { type: String, default: null },
    cardBrand: { type: String, default: null },
    payoutBatchId: { type: String, default: null, index: true },
    invoiceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "BillkoInvoice" }],
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

paymentLedgerEntrySchema.index({ organization: 1, createdAt: -1 });
paymentLedgerEntrySchema.index({ companyOrganizer: 1, createdAt: -1 });

module.exports = mongoose.model("PaymentLedgerEntry", paymentLedgerEntrySchema);
