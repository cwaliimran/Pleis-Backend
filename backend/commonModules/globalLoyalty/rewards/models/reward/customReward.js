const GlobalReward = require("./BaseReward");
const mongoose = require("mongoose");

const GlobalCustomReward = GlobalReward.discriminator(
  "globalCustomReward",
  new mongoose.Schema(
    {
      customReward: {
        image: { type: String, default: "" },
        title: { type: String, default: "" },
        description: { type: String, default: "" },
      },
    },
    { _id: false }
  )
);

module.exports = GlobalCustomReward;
