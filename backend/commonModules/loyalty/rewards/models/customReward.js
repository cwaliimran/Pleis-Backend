const Reward = require("./BaseReward");

const mongoose = require("mongoose");

const CustomReward = Reward.discriminator(
  "customReward",
  new mongoose.Schema(
    {
      // custom reward
      customReward: {
        image: { type: String, default: "" },
        title: { type: String, default: "" },
        description: { type: String, default: "" },
      },
    },
    { _id: false }
  )
);

module.exports = CustomReward;
