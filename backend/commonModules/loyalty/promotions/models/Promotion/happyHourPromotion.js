const Promotion = require("./basePromotion");
const mongoose = require("mongoose");

const HappyHourPromotion = Promotion.discriminator(
  "happyHour",
  new mongoose.Schema(
    {
      pointsMultiplier: { type: Number, default: 1 }, // for happy hour
    },
    { _id: false }
  )
);

module.exports = HappyHourPromotion;
