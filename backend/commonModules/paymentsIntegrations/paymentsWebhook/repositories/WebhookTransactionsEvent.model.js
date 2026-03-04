const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["monri"],
      required: true,
      index: true,
    },

    orderType: {
      type: String,
      enum: ["ticketingbookings", "userreservations", "menuorders", "tickettransfer"],
      required: true,
    },

    amount: {
      type: String,
    },
    orderNumber: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
      required: true,
    },
    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      required: true,
    },

    transactionId: {
      type: String,
      default: null,
    },

    payload: {
      type: Object,
      required: true,
    },
  },
  { timestamps: true }
);

webhookEventSchema.index(
  {
    provider: 1,
    transactionId: 1,
    orderNumber: 1
  },
  { unique: true }
);
webhookEventSchema.index({ createdAt: -1 });
webhookEventSchema.index({ paymentStatus: 1, createdAt: -1 });
webhookEventSchema.index({ organization: 1, createdAt: -1 });

webhookEventSchema.index({
  organization: 1,
  companyOrganizer: 1,
  paymentStatus: 1,
  createdAt: -1,
  _id: -1
});
webhookEventSchema.index({ createdAt: -1, _id: -1 });


module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
