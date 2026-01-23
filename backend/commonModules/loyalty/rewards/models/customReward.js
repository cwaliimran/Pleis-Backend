const Reward = require("./BaseReward");

const mongoose = require("mongoose");

const CustomReward = Reward.discriminator(
  "customReward",
  new mongoose.Schema(
    {
    },
    { _id: false }
  )
);

module.exports = CustomReward;
