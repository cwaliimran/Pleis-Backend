const mongoose = require("mongoose");

const baseRewardsSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      default: "",
    },
    title: { type: String, trim: true, required: true },
    description: { type: String, default: "" },
    rewardType: {
      type: String,
      required: true,
      enum: ["buyMenuItemReward", "customReward", "ticketReward"],
    },

    sortingType: {
      // for display purposes and grouping similar rewards
      type: String,
      default: "",
    },
    endDate: { type: Date, default: null },

    minPointsRequiredToClaim: { type: Number, default: null },
    claimLimit: { type: Number, default: null },

    percentOff: { type: Number, default: null },

    tierLimit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tiers",
      default: null,
    },

    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    maxLimitPerUser: {
      type: Number,
      default: null,
    },
    // When false, reward is hidden from app redeem lists but can still be linked to challenges
    availableAsReward: {
      type: Boolean,
      default: true,
    },
    // When true, reward can only be used inside a challenge (aligns with availableAsReward=false)
    challengeOnly: {
      type: Boolean,
      default: false,
    },
    // Deprecated (R2): replaced by challengeOnly. Kept for backward compatibility; no longer read by app.
    isPromotionOnly: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "completed", "deleted"],
      default: "active",
    },

  },
  { timestamps: true, discriminatorKey: "rewardType" },
);

module.exports =
  mongoose.models.Reward ||
  mongoose.model("Reward", baseRewardsSchema);

