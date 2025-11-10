const Reward = require("./BaseReward");
const mongoose = require("mongoose");

const TicketReward = Reward.discriminator(
  "ticketReward",
  new mongoose.Schema(
    {
      event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Events",
        required: true,
      },
    },
    { _id: false }
  )
);

module.exports = TicketReward;
