const Promotion = require("./BasePromotion");
const mongoose = require("mongoose");

const ProductSalePromotion = Promotion.discriminator(
  "productSale",
  new mongoose.Schema(
    {
      menuItem: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: "MenuItems",
        required: true,
      },
      discountedPercent: { type: Number, required: true },
    },
    { _id: false }
  )
);

module.exports = ProductSalePromotion;
