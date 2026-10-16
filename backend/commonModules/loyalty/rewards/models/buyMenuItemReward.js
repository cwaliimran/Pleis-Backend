const Reward = require("./baseReward");
const mongoose = require("mongoose");

const BuyMenuItemReward = Reward.discriminator(
  "buyMenuItemReward",
  new mongoose.Schema(
    {
      // Array of menu items (same pattern as challenge.taskMenuItem).
      // Legacy single-ObjectId docs are still readable via asMenuItemArray helpers.
      menuItem: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: "MenuItems",
        required: true,
      },
    },
    { _id: false },
  ),
);

module.exports = BuyMenuItemReward;
