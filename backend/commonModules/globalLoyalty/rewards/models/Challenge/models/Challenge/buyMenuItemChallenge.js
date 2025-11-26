const mongoose = require("mongoose");
const GlobalChallenge = require("./BaseChallenge");

const GlobalBuyMenuItemChallenge = GlobalChallenge.discriminator(
  "globalbuyMenuItem", // Name of the discriminator
  new mongoose.Schema(
    {
      taskMenuItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuItems", // Reference to the MenuItems collection
        required: true,
      },
    },
    { _id: false }
  )
);

module.exports = GlobalBuyMenuItemChallenge;
