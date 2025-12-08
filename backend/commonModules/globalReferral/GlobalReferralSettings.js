const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const globalReferralSchema = new mongoose.Schema(
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

    purchaseThresholdAmount: {
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

    expiryDate: {
      type: Date,
      required: true,
    },

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

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GlobalReferral", globalReferralSchema);
