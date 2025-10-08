const Reward = require("./baseReward");
const mongoose = require("mongoose");

const BuyMenuItemReward = Reward.discriminator(
  "buyMenuItemReward",
  new mongoose.Schema(
    {
      menuItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuItems",
        required: true,
      },
    },
    { _id: false }
  )
);

module.exports = BuyMenuItemReward;
