const mongoose = require("mongoose");
const GlobalChallenge = require("./BaseChallenge");

const GlobalReferUsersChallenge = GlobalChallenge.discriminator(
  "globalreferUsers", // Name of the discriminator
  new mongoose.Schema(
    {
      taskValue: { type: Number, default: 1 }, // Number of users to refer
    },
    { _id: false }
  )
);

module.exports = GlobalReferUsersChallenge;
