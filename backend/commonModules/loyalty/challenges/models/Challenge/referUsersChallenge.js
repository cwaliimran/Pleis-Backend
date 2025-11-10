const Challenge = require("./BaseChallenge");
const mongoose = require("mongoose");

const ReferUsersChallenge = Challenge.discriminator(
  "referUsers",
  new mongoose.Schema(
    {
      taskValue: { type: Number, default: 1 }, // # of users to refer
    },
    { _id: false }
  )
);

module.exports = ReferUsersChallenge;
