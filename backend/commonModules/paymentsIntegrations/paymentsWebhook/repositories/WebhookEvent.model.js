const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["monri", "stripe"],
      required: true,
      index: true,
    },

    eventId: {
      type: String,
      required: true,
    },

    orderType: {
      type: String,
      enum: ["ticketingbookings", "userreservations", "menuorders", "tickettransfer"],
      required: true,
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      required: true,
    },

    paymentId: {
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
    eventId: 1,
    orderId: 1,
    paymentStatus: 1,
  },
  { unique: true }
);

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
