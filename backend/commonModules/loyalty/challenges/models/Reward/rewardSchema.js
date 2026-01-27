
const mongoose = require("mongoose");

const rewardSchema = new mongoose.Schema(
  {
    rewardType: {
      type: String,
      enum: ["points", "specialTicket", "menuItem", "customReward"],
      default: "points",
    },
    rewardValue: { type: Number, default: 0 },
    specialTicket: {
          companyOrganizer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
          },
          organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organizations",
            default: null,
          },
          event: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Event",
            default: null,
          },
    
          ticket: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Ticketings",
            default: null,
          },
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

module.exports = rewardSchema;
