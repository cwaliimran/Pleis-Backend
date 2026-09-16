const mongoose = require("mongoose");

const billkoInvoiceSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: [
        "service_fee",
        "tickets",
        "menu_items",
        "reservation",
        "subscription",
        "commission",
        "refund_storno",
      ],
      required: true,
    },
    seller: {
      type: String,
      enum: ["pleis", "organizer"],
      required: true,
    },
    orderType: {
      type: String,
      enum: [
        "ticketingbookings",
        "userreservations",
        "menuorders",
        "subscription",
        "commission",
      ],
      required: true,
    },
    orderNumber: { type: String, required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
    },
    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    billkoId: { type: String, index: true },
    invoiceNumber: { type: String, index: true },
    fiscalizationNumber: { type: String },
    // Croatian ZKI (zaštitni kod izdavatelja). Billko may send as
    // fiscalProtectionCode, zki, or ZKI.
    fiscalProtectionCode: { type: String, default: "" },
    invoicePreviewLink: { type: String },
    status: {
      type: String,
      enum: ["pending", "created", "fiscalized", "fiscalization_failed", "refunded"],
      default: "pending",
    },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "EUR" },
    taxRateLabels: { type: [String], default: [] },
    pdfStorageKey: { type: String },
    pdfFileUrl: { type: String },
    pdfFileName: { type: String },
    pdfEmailedAt: { type: Date, default: null },
    rawResponse: { type: mongoose.Schema.Types.Mixed },
    lastError: { type: String },
  },
  { timestamps: true },
);

billkoInvoiceSchema.index({ orderNumber: 1, kind: 1 }, { unique: true });

module.exports = mongoose.model("BillkoInvoice", billkoInvoiceSchema);
