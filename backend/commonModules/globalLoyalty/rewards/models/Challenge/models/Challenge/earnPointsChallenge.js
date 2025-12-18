const mongoose = require("mongoose");
const GlobalChallenge = require("./BaseChallenge");

const GlobalEarnPointsChallenge = GlobalChallenge.discriminator(
  "globalEarnPoints", // Name of the discriminator
  new mongoose.Schema(
    {
      taskValue: { type: Number, required: true }, // Points to earn
    },
    { _id: false }
  )
);

module.exports = GlobalEarnPointsChallenge;
