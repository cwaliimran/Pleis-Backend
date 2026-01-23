const mongoose = require("mongoose");

// Loyalty Referral Settings Schema
const loyaltyReferralSettingsSchema = new mongoose.Schema(
  {
    referralLimit: {
      type: Number,
      required: true,
      default: 0,
    },

    // Points earned by the user
    userPoints: {
      type: Number,
      required: true,
      default: 0,
    },

    referrerPoints: {
      type: Number,
      required: true,
      default: 0,
    },

    minimumPurchases: {
      type: Number,
      required: true,
      default: 0,
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
      unique: true,  
    },

    type: {
      type: String,
      default: "loyalty",
    },
  },
  {
    timestamps: true,
  }
);

// Create or use the existing model
const LoyaltyReferralSettings =
  mongoose.models.LoyaltyReferralSettings ||
  mongoose.model("LoyaltyReferralSettings", loyaltyReferralSettingsSchema);

module.exports = LoyaltyReferralSettings;
