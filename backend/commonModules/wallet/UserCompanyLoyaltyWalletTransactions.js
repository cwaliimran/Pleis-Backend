const mongoose = require("mongoose");

const userCompanyLoyaltyWalletTransactionSchema = new mongoose.Schema(
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

    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
    },
    // -----------------------------
    // SOURCE OF THE POINTS
    // -----------------------------
    objectType: {
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
        "gift",
      ],
      required: true,
    },

    // -----------------------------
    // RELATED ENTITIES (Optional)
    // -----------------------------
    objectId: { type: mongoose.Schema.Types.Mixed, default: null },

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

    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

const UserCompanyLoyaltyWalletTransactions = mongoose.model(
  "UserCompanyLoyaltyWalletTransactions",
  userCompanyLoyaltyWalletTransactionSchema
);

module.exports = { UserCompanyLoyaltyWalletTransactions };
