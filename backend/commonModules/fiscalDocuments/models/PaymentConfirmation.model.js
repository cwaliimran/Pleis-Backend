const mongoose = require("mongoose");

const paymentConfirmationSchema = new mongoose.Schema(
  {
    confirmationNumber: { type: String, required: true, unique: true },
    transactionId: { type: String, required: true, index: true },
    orderReference: { type: String, required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    module: {
      type: String,
      enum: ["ORDERING", "RESERVATION", "TICKETING"],
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
    customerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    paidAt: { type: Date, required: true },
    paymentMethod: { type: String, required: true },
    cardLast4: { type: String, default: null },
    cardBrand: { type: String, default: null },
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
    locale: { type: String, enum: ["en", "hr"], default: "hr" },
    emailSentAt: { type: Date, default: null },
    // Mailgun message id from send API (`data.id`), used by delivery webhook.
    emailMessageId: { type: String, default: null, index: true },
    // Mail delivery lifecycle. Bounce/delivered updated by Mailgun webhook.
    deliveryStatus: {
      type: String,
      enum: ["pending", "sent", "delivered", "bounced"],
      default: "pending",
    },
  },
  { timestamps: true },
);

paymentConfirmationSchema.index({ orderId: 1, module: 1 });
paymentConfirmationSchema.index(
  { orderId: 1, module: 1, cancelsConfirmationId: 1 },
  { unique: true },
);
paymentConfirmationSchema.index({ customerEmail: 1, confirmationNumber: 1 });

module.exports = mongoose.model(
  "PaymentConfirmation",
  paymentConfirmationSchema,
);
