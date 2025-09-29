const Promotion = require("./basePromotion");
const mongoose = require("mongoose");

const ProductSalePromotion = Promotion.discriminator(
  "productSale",
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

module.exports = ProductSalePromotion;
