const GlobalBasePromotion = require("./basePromotion");
const mongoose = require("mongoose");

const GlobalHappyHourPromotion = GlobalBasePromotion.discriminator(
  "globalHappyHourPromotion",
  new mongoose.Schema(
    {
      pointsMultiplier: { type: Number, default: 1 }, // for happy hour
    },
    { _id: false }
  )
);

module.exports = GlobalHappyHourPromotion;