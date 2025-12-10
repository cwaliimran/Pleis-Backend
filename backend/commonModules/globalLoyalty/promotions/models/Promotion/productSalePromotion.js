const GlobalBasePromotion = require("./basePromotion");
const mongoose = require("mongoose");

const GlobalProductSalePromotion = GlobalBasePromotion.discriminator(
  "globalProductSale",
  new mongoose.Schema(
    {
      menuItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuItems",
        required: true,
      },
      discountedPrice: { type: Number, required: true },
    },
    { _id: false }
  )
);

module.exports = GlobalProductSalePromotion;
