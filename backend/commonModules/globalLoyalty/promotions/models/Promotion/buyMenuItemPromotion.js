const GlobalBasePromotion = require("./basePromotion");
const mongoose = require("mongoose");

const GlobalBuyMenuItemPromotion = GlobalBasePromotion.discriminator(
  "globalBuyMenuItemPromotion",
  new mongoose.Schema(
    {
      menuItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuItems",
        required: true,
      },
      extraPoints: { type: Number, default: 0 },
    },
    { _id: false }
  )
);

module.exports = GlobalBuyMenuItemPromotion;
