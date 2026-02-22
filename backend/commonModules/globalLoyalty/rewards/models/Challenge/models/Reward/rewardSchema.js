const mongoose = require("mongoose");

const globalrewardSchema = new mongoose.Schema(
  {
    rewardType: {
      type: String,
      enum: ["points", "specialTicket", "customReward"],
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
      timeSlot: {
        type: String,
        default: null,
      },

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
