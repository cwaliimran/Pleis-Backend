const Promotion = require("./BasePromotion");
const mongoose = require("mongoose");

const BuyMenuItemPromotion = Promotion.discriminator(
  "buyMenuItemPromotion",
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

module.exports = BuyMenuItemPromotion;
