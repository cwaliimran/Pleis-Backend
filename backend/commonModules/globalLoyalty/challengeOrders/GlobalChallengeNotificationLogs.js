const mongoose = require("mongoose");

const GlobalChallengeNotificationLogSchema = new mongoose.Schema(
  {
    globalChallengeOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GlobalChallengeOrder",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["GLOBAL_EXPIRING_SOON"],
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Prevent duplicates across servers / cron runs
GlobalChallengeNotificationLogSchema.index(
  { globalChallengeOrderId: 1, type: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "GlobalChallengeNotificationLogs",
  GlobalChallengeNotificationLogSchema
);