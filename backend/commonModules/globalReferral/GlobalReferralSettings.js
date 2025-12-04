const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

// Global Referral Program Schema (admin-controlled)
const globalReferralSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      unique: true,
      index: true,
      default: () => nanoid(),
    },

    rewardAmount: { type: Number, required: true, default: 40 },  // referrer points 

    minimumPurchases: { type: Number, required: true },
    purchaseThresholdAmount: { type: Number, required: true },

    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Reference to the User model
      required: true,
    },

    expiryDate: { type: Date, required: true },

    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },

    type: {
      type: String,
      enum: ["global", "company", "organizer", "user"],
      required: true,
    },

    referralLimit: { type: Number, default: 10 },  // Referral limit default to 10
    referrerPoints: { type: Number, default: 10 },  // Referrer points default to 10

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Model for the global referral schema
const GlobalReferral = mongoose.model("GlobalReferral", globalReferralSchema);

module.exports = {
  GlobalReferral,
};
