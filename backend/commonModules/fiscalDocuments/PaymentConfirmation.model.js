const mongoose = require("mongoose");

const paymentConfirmationSchema = new mongoose.Schema(
  {
    confirmationNumber: { type: String, required: true, unique: true },
    transactionId: { type: String, required: true, index: true },
    orderReference: { type: String, required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    module: {
      type: String,
      enum: ["ORDERING", "RESERVATION"],
      required: true,
    },
    organizerCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
    },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    paidAt: { type: Date, required: true },
    paymentMethod: { type: String, required: true },
    amountCents: { type: Number, required: true },
    currency: { type: String, default: "EUR" },
    items: { type: Array, default: [] },
    voucherId: { type: String, default: null },
    voucher: {
      code: String,
      amount: Number,
      validFrom: Date,
      validTo: Date,
      venueName: String,
    },
    status: {
      type: String,
      enum: ["ISSUED", "CANCELLED"],
      default: "ISSUED",
    },
    cancelsConfirmationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentConfirmation",
      default: null,
    },
    pdfStorageKey: { type: String, default: "" },
    pdfFileUrl: { type: String, default: "" },
    htmlStorageKey: { type: String, default: "" },
    htmlFileUrl: { type: String, default: "" },
    documentHash: { type: String, default: "" },
    issuedAt: { type: Date, default: Date.now },
    locale: { type: String, enum: ["en", "hr"], default: "en" },
    emailSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentConfirmationSchema.index({ orderId: 1, module: 1 }, { unique: true });

module.exports = mongoose.model(
  "PaymentConfirmation",
  paymentConfirmationSchema,
);
