const { default: mongoose } = require("mongoose");

const rewardInventoryFreezeSchema = new mongoose.Schema({
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ticketings",
    required: true,
    index: true,
  },

  objectId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },

  objectType: {
    type: String,
    enum: ["Reward", "GlobalReward", "Challenge", "GlobalChallenge"],
    required: true,
  },

  claimLimit: {
    type: Number,
    required: true,
  },

  // REQUIRED to prevent double subtraction
  claimed: {
    type: Number,
    default: 0,
  },

}, { timestamps: true });

rewardInventoryFreezeSchema.index(
  { ticket: 1, objectId: 1, objectType: 1 },
  { unique: true }
);

const RewardInventoryFreeze = mongoose.model(
  "RewardInventoryFreeze",
  rewardInventoryFreezeSchema
);

module.exports = RewardInventoryFreeze;