const mongoose = require("mongoose");

const LoyaltyChallengeNotificationLogSchema = new mongoose.Schema(
  {
    challengeOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltyChallengesOrders",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["EXPIRING_SOON"],
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Prevent duplicates across cron runs or servers
LoyaltyChallengeNotificationLogSchema.index(
  { challengeOrderId: 1, type: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "LoyaltyChallengeNotificationLogs",
  LoyaltyChallengeNotificationLogSchema
);