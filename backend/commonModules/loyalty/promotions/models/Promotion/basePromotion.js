const mongoose = require("mongoose");

const basePromotionsSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      default: "",
    },
    title: { type: String, trim: true, required: true },
    description: { type: String, default: "" },
    promotionType: {
      type: String,
      required: true,
      enum: ["happyHour", "buyMenuItem", "productSale"],
    },

    startDate: { type: Date, default: null }, //contains date/time in happyHour case otherwise just date
    endDate: { type: Date, default: null },
    repeatSettings: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly"],
      default: "none",
    },


    tierLimit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tiers",
      default: null,
    },

    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "completed", "deleted"],
      default: "active",
    },

  },
  { timestamps: true, discriminatorKey: "promotionType" }
);

// ✅ Centralized transformation logic
basePromotionsSchema.methods.toJSON = function () {
  const obj = this.toObject({ virtuals: true });

  // Clean reward fields
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

  // Clean task fields
  switch (obj.promotionType) {
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

module.exports = mongoose.model("Promotion", basePromotionsSchema);
