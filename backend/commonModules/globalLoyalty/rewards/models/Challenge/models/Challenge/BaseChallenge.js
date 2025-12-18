const mongoose = require("mongoose");
const globalRewardSchema = require("../Reward/rewardSchema"); // Import reward schema

const baseGlobalChallengeeSchema = new mongoose.Schema(
  {
    image: { type: String, default: "" },
    title: { type: String, trim: true, required: true },
    description: { type: String, default: "" },
    taskType: {
      type: String,
      required: true,
      enum: ["globalVisit", "globalEarnPoints", "globalBuyMenuItem", "globalReferUsers"], // All tasks in the same table
    },
    claimLimit: { type: Number, default: null },
    endDate: { type: Date, default: null },
    tierLimit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GlobalStatusLevels",
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "completed", "deleted"],
      default: "active",
    },
    reward: globalRewardSchema, // Nested reward (same for all task types)
  },
  { timestamps: true, discriminatorKey: "taskType" } // Discriminator key for task type differentiation
);

// Centralized transformation logic for cleaning task and reward fields
baseGlobalChallengeeSchema.methods.toJSON = function () {
  const obj = this.toObject({ virtuals: true });

  // Clean reward fields based on rewardType
  if (obj.reward) {
    switch (obj.reward.rewardType) {
      case "points":
      case "specialTicket":
        delete obj.reward.rewardMenuItem;
        delete obj.reward.customReward;
        break;
      case "menuItem":
        delete obj.reward.rewardValue;
        delete obj.reward.customReward;
        break;
      case "customReward":
        delete obj.reward.rewardValue;
        delete obj.reward.rewardMenuItem;
        break;
    }
  }

  // Clean task fields based on taskType
  switch (obj.taskType) {
    case "visit":
      delete obj.taskValue;
      delete obj.taskMenuItem;
      break;
    case "earnPoints":
      delete obj.taskMenuItem;
      break;
    case "buyMenuItem":
      delete obj.taskValue;
      break;
    case "referUsers":
      delete obj.taskMenuItem;
      break;
  }

  return obj;
};

module.exports = mongoose.model("GlobalChallenge", baseGlobalChallengeeSchema);
