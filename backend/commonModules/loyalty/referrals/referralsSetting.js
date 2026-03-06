const mongoose = require("mongoose");

const loyaltyReferralSettingsSchema = new mongoose.Schema(
  {
    referralLimit: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    userPoints: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    referrerPoints: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    minimumPurchases: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "inactive",
    },

    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * 🔒 Enforce one settings document per companyOrganizer
 */
loyaltyReferralSettingsSchema.index(
  { companyOrganizer: 1 },
  { unique: true }
);

const LoyaltyReferralSettings =
  mongoose.models.LoyaltyReferralSettings ||
  mongoose.model(
    "LoyaltyReferralSettings",
    loyaltyReferralSettingsSchema
  );

module.exports = LoyaltyReferralSettings;