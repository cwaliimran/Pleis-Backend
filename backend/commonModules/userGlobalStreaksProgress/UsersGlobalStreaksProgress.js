const mongoose = require("mongoose");

const UsersGlobalStreaksProgressSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
    index: true
  },

  streak: {
    current: { type: Number, default: 0 },
    longest: { type: Number, default: 0 },

    lastIncrementAt: { type: Date, default: null },

    cooldownEndsAt: { type: Date, default: null },

    resetAt: { type: Date, default: null },

    lastResetAt: { type: Date, default: null },

    resetCount: { type: Number, default: 0 }
  },

  metrics: {
    referral: { count: { type: Number, default: 0 } },
    spending: { amount: { type: Number, default: 0 } },
    singlePurchase: { amount: { type: Number, default: 0 } },
    repeatVisit: { count: { type: Number, default: 0 } },
    venueExplorer: { count: { type: Number, default: 0 } },
    streak: { streakDays: { type: Number, default: 0 } },
    topSpender: { rank: { type: Number, default: null } }
  },

  totalValidTransactions: {
    type: Number,
    default: 0
  },

  totalPointsEarned: {
    type: Number,
    default: 0
  }

}, { timestamps: true });

module.exports = mongoose.model("UsersGlobalStreaksProgress", UsersGlobalStreaksProgressSchema);