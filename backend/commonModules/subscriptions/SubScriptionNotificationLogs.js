// models/EventNotificationLogs.js
const mongoose = require("mongoose");

/* 
Even if cron runs twice

Even if multiple servers

Only one notification per event per type
*/
const SubscriptionNotificationLogSchema = new mongoose.Schema({
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true,
  },
  type: {
    type: String,
    enum: [
      "10D",
      "5D",
      "1D",
      "24H",
      "EXPIRED"
    ],
    required: true,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

SubscriptionNotificationLogSchema.index(
  { subscriptionId: 1, type: 1 },
  { unique: true } // prevents duplicate send
);

module.exports = mongoose.model(
  "SubscriptionNotificationLogs",
  SubscriptionNotificationLogSchema
);


