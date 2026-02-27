const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const globalReferralSettingsSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      unique: true,
      index: true,
      default: () => nanoid(),
    },
    // USER POINTS (reward earned by user)
    userPoints: {
      type: Number,
      required: true,
    },

    // REFERRER POINTS (reward earned by referrer)
    referrerPoints: {
      type: Number,
      required: true,
    },

    // Conditions
    minimumPurchases: {
      type: Number,
      required: true,
    },

    // Max allowed referrals
    referralLimit: {
      type: Number,
      default: 10,
    },

    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "inactive",
    },

  },
  { timestamps: true }
);

module.exports = mongoose.model("GlobalReferralSettings", globalReferralSettingsSchema);
