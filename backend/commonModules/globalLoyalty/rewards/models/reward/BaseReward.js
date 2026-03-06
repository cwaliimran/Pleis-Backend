// GlobalReward.js
const mongoose = require("mongoose");

const globalRewardSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      default: "",
    },
    title: { type: String, trim: true, required: true },
    description: { type: String, default: "" },
    rewardType: {
      type: String,
      enum: ["globalCustomReward", "globalTicketReward"],
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GlobalRewardCategories",
      required: true,
    },
    minPointsRequiredToClaim: { type: Number, default: null },
    claimLimit: { type: Number, default: null },
    percentOff: { type: Number, default: null },
    tierLimit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GlobalStatusLevels",
      default: null,
    },
    endDate: { type: Date, default: null },

    status: {
      type: String,
      enum: ["active", "inactive", "completed", "deleted"],
      default: "active",
    },
    
    //if enabled reward will not show in app loyalty of rewards, but it will be tied to promotions and show in promotions section only
    isPromotionOnly: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, discriminatorKey: "rewardType" }
);

// Export the base model as GlobalReward
const GlobalReward = mongoose.models.GlobalReward || mongoose.model("GlobalReward", globalRewardSchema);

module.exports = GlobalReward;
