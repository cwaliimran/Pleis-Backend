const Promotion = require("./BasePromotion");
const mongoose = require("mongoose");

const ExtraPointsForItemPromotion = Promotion.discriminator(
  "extraPointsForItem",
  new mongoose.Schema(
    {
      menuItem: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: "MenuItems",
        required: true,
      },
      extraPoints: { type: Number, default: 0 },
    },
    { _id: false },
  ),
);

module.exports = ExtraPointsForItemPromotion;
