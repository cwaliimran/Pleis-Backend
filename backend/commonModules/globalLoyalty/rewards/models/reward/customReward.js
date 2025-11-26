const GlobalReward = require("./BaseReward");
const mongoose = require("mongoose");

const GlobalCustomReward = GlobalReward.discriminator(
  "GlobalCustomReward",
  new mongoose.Schema(
    {
      image: { type: String, default: "" },
      title: { type: String, default: "" },
      description: { type: String, default: "" },
    },
    { _id: false } // Optional, use this if you don't want _id in subdocuments
  )
);

module.exports = GlobalCustomReward;
