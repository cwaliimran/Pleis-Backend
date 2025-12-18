const Challenge = require("./BaseChallenge");
const mongoose = require("mongoose");

const BuyMenuItemChallenge = Challenge.discriminator(
  "buyMenuItem",
  new mongoose.Schema(
    {
      taskValue: {
        type: Number,
        default: 1
      },
      taskMenuItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuItems",
        required: true,
      },
    },
    { _id: false }
  )
);

module.exports = BuyMenuItemChallenge;
