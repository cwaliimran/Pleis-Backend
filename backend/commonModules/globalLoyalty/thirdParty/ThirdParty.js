const mongoose = require("mongoose");

// GlobalThirdParty Schema
const globalThirdPartySchema = new mongoose.Schema(
  {
    image: {
      type: String,
      default: "",
      trim: true,
    },

    title: {
      type: String,
      trim: true,
      required: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },
    globalRewardCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GlobalRewardCategory",
      required: true,
    },

    pointCost: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    claimLimit: {
      type: Number,
      min: 1,
      default: 0, // optional
    },

    rewardSourceLink: {
      type: String,
      trim: true,
      default: "",
    },

    publicKeyForPartner: {
      type: String,
      trim: true,
      default: "",
    },

    statusLevel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StatusLevels',
      required: true,
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

// Export model
const GlobalThirdParty =
  mongoose.models.GlobalThirdParty ||
  mongoose.model("GlobalThirdParty", globalThirdPartySchema);

module.exports = GlobalThirdParty;
