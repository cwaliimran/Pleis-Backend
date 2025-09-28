const Challenge = require("./baseChallenge");
const mongoose = require("mongoose");

const EarnPointsChallenge = Challenge.discriminator(
  "earnPoints",
  new mongoose.Schema(
    {
      taskValue: { type: Number, required: true }, // points to earn
    },
    { _id: false }
  )
);

module.exports = EarnPointsChallenge;
