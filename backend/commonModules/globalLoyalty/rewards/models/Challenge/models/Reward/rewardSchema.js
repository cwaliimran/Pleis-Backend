
const mongoose = require("mongoose");

const globalrewardSchema = new mongoose.Schema(
  {
    rewardType: {
      type: String,
      enum: ["points", "menuItem", "specialTicket", "customReward"],
      default: "points",
    },
    rewardValue: { type: Number, default: 0 },
    specialTicket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ticketings",
      default: null,
    },
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

module.exports = globalrewardSchema;
