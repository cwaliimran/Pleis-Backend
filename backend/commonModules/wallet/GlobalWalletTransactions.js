const mongoose = require("mongoose");

const globalWalletTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // -----------------------------
    // TYPE OF TRANSACTION
    // -----------------------------
    type: {
      type: String,
      enum: ["earn", "redeem", "adjustment"],
      required: true,
    },

    // -----------------------------
    // SOURCE OF THE POINTS
    // -----------------------------
    source: {
      type: String,
      enum: [
        "ticket",
        "reservation",
        "event",
        "order",
        "challenge",
        "badge",
        "referral",
        "admin",
        "promotion",
        "system",
      ],
      required: true,
    },

    // -----------------------------
    // RELATED ENTITIES (Optional)
    // -----------------------------
    context: {
      ticket: { type: mongoose.Schema.Types.ObjectId, ref: "Tickets", default: null },
      order: { type: mongoose.Schema.Types.ObjectId, ref: "Orders", default: null },
      event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", default: null },
      reservation: { type: mongoose.Schema.Types.ObjectId, ref: "Reservations", default: null },
      reward: { type: mongoose.Schema.Types.ObjectId, ref: "Rewards", default: null },
      badge: { type: mongoose.Schema.Types.ObjectId, ref: "Badges", default: null },
      promo: { type: mongoose.Schema.Types.ObjectId, ref: "Promotion", default: null },
      challenge: { type: mongoose.Schema.Types.ObjectId, ref: "Challenges", default: null },
    },

    // -----------------------------
    // POINTS DETAILS
    // -----------------------------
    points: {
      base: { type: Number, required: true },       // before multipliers
      multiplier: { type: Number, default: 1 },     // happy hour, promo, tier bonus
      total: { type: Number, required: true },      // base * multiplier
    },

    // -----------------------------
    // BALANCE AFTER TRANSACTION
    // (Bank Statement Style)
    // -----------------------------
    closingBalance: {
      type: Number,
      required: true,
      // Example: after earning +50, new balance = oldBalance + 50
    },

    // -----------------------------
    // METADATA
    // -----------------------------
    description: {
      type: String,
      default: "",
    },

    statusLevelAtTime: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GlobalStatusLevels",
      default: null,
    }, // freeze status at time of transaction

    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

const GlobalWalletTransactions = mongoose.model(
  "GlobalWalletTransactions",
  globalWalletTransactionSchema
);

module.exports = { GlobalWalletTransactions };
