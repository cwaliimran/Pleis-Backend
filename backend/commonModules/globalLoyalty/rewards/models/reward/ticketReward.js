const GlobalReward = require("./BaseReward");
const mongoose = require("mongoose");

const GlobalTicketReward = GlobalReward.discriminator(
  "globalTicketReward",
  new mongoose.Schema(
    {
      event: { type: mongoose.Schema.Types.ObjectId, ref: "Events", required: true },
      
    },
    { _id: false } // Optional, use this if you don't want _id in subdocuments
  )
);

module.exports = GlobalTicketReward;