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
    globalRewardType: {
      type: String,
     enum: ["GlobalCustomReward", "GlobalTicketReward"],
      required: true,
    },
    sortingType: {
      type: String,
      default: "",
    },
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
    status: {
      type: String,
      enum: ["active", "inactive", "completed", "deleted"],
      default: "active",
    },
  },
  { timestamps: true, discriminatorKey: "globalRewardType" }
);

// Export the base model as GlobalReward
const GlobalReward = mongoose.models.GlobalReward || mongoose.model("GlobalReward", globalRewardSchema);

module.exports = GlobalReward;
