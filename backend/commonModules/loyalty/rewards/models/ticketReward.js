const Reward = require("./baseReward");
const mongoose = require("mongoose");

const TicketReward = Reward.discriminator(
  "ticketReward",
  new mongoose.Schema(
    {
      event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event",
        required: true,
      },
      ticket: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ticketings",
        required: true,
      },
      timeSlot: {
        type: String,
        default: null,
      },
      isFastTrack: {
        type: Boolean,
        default: false,
      },
    },
    { _id: false }
  )
);

module.exports = TicketReward;
