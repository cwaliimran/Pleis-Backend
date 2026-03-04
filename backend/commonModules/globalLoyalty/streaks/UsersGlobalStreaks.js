// models/UsersGlobalStreaks.js
const mongoose = require("mongoose");

const UsersGlobalStreaksSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    /* =======================================================
       🔥 GLOBAL STREAK ENGINE (TIME-BASED LOGIC)
    ======================================================= */

    streak: {
      current: {
        type: Number,
        default: 0,
        min: 0,
      },

      longest: {
        type: Number,
        default: 0,
        min: 0,
      },

      lastIncrementAt: {
        type: Date,
        default: null,
      },

      cooldownEndsAt: {
        type: Date,
        default: null,
      },

      resetAt: {
        type: Date,
        default: null,
      },

      lastResetAt: {
        type: Date,
        default: null,
      },

      resetCount: {
        type: Number,
        default: 0,
      },
    },

    /* =======================================================
       📊 CATEGORY METRICS (BADGE SOURCE)
    ======================================================= */

    metrics: {
      referral: {
        count: { type: Number, default: 0 },
      },

      spending: {
        amount: { type: Number, default: 0 },
      },

      singlePurchase: {
        amount: { type: Number, default: 0 },
      },

      repeatVisit: {
        count: { type: Number, default: 0 },
      },

      venueExplorer: {
        count: { type: Number, default: 0 },
      },

      streak: {
        streakDays: { type: Number, default: 0 }, // mirrors streak.current
      },

      topSpender: {
        rank: { type: Number, default: null },
      },
    },

    /* =======================================================
       🎯 GLOBAL TOTALS
    ======================================================= */

    totalValidTransactions: {
      type: Number,
      default: 0,
    },

    totalPointsEarned: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "UsersGlobalStreaks",
  UsersGlobalStreaksSchema
);