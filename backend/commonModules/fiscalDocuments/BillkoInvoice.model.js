const mongoose = require("mongoose");

const billkoInvoiceSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["service_fee", "tickets", "subscription", "commission"],
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
    pdfFileName: { type: String },
    rawResponse: { type: mongoose.Schema.Types.Mixed },
    lastError: { type: String },
  },
  { timestamps: true },
);

billkoInvoiceSchema.index({ orderNumber: 1, kind: 1 }, { unique: true });

module.exports = mongoose.model("BillkoInvoice", billkoInvoiceSchema);
