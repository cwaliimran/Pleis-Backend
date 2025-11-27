const mongoose = require("mongoose");
const GlobalChallenge = require("./BaseChallenge");

const GlobalVisitChallenge = GlobalChallenge.discriminator(
  "globalvisit", // Name of the discriminator
  new mongoose.Schema(
    {
      taskValue: { type: Number, default: 1 }, // Default value for visit
    },
    { _id: false }
  )
);

module.exports = GlobalVisitChallenge;
