const mongoose = require("mongoose");

// Referral Settings Schema
const referralSettingsSchema = new mongoose.Schema(
  {
    referralLimit: {
      type: Number,
      required: true,
      default: 0,
    },

    userPoints: {
      type: Number,
      required: true,
      default: 0,
    },

    referralPoints: {
      type: Number,
      required: true,
      default: 0,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },

    createID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create or use the existing model
const ReferralSettings =
  mongoose.models.ReferralSettings ||
  mongoose.model("ReferralSettings", referralSettingsSchema);

module.exports = ReferralSettings;
