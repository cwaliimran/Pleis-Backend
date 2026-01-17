const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true }, // stripe | monri
    eventId: { type: String, required: true },
    type: { type: String, enum: ["ticketing", "reservation"], required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    payload: Object,
  },
  { timestamps: true }
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
