
const mongoose = require("mongoose");

const rewardSchema = new mongoose.Schema(
  {
    rewardType: {
      type: String,
      enum: ["points", "menuItem", "specialTicket", "customReward"],
      default: "points",
    },
    rewardValue: { type: Number, default: 0 },

    // menu item reward
    rewardMenuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItems",
      default: null,
    },

    // custom reward
    customReward: {
      image: { type: String, default: "" },
      title: { type: String, default: "" },
      description: { type: String, default: "" },
    },
  },
  { _id: false }
);

module.exports = rewardSchema;
