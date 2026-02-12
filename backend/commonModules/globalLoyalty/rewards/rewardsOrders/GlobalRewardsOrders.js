const mongoose = require("mongoose");
const { customAlphabet } = require("nanoid");

const generateRewardId =
  customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);

const globalRewardsOrderSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      index: true,
      default: () => `GRWD-${generateRewardId()}`, 
      // GRWD = Global Reward Order
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // reward source
    sourceType: {
      type: String,
      enum: ["globalRewards"],
      default: "globalRewards",
      index: true,
    },

    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GlobalReward",
      required: true,
      index: true,
    },

    // snapshot used to lock reward values at time of claim
    snapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // points handling for redemption
    pointsUsed: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["pending", "completed", "expired"],
      // pending = claimed but not redeemed
      // completed = redeemed successfully
      // expired = claim expired
      default: "pending",
      index: true,
    },

    redeemedAt: {
      type: Date,
      default: null,
    },

    redeemedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const GlobalRewardsOrders =
  mongoose.models.GlobalRewardsOrders ||
  mongoose.model("GlobalRewardsOrders", globalRewardsOrderSchema);

module.exports = { GlobalRewardsOrders };
