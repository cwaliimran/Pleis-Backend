const GlobalReward = require("./BaseReward");
const mongoose = require("mongoose");

const GlobalCustomReward = GlobalReward.discriminator(
  "globalCustomReward",
  new mongoose.Schema(
    {
    },
    { _id: false }
  )
);

module.exports = GlobalCustomReward;
