const GlobalBasePromotion = require("./basePromotion");
const mongoose = require("mongoose");

const GlobalHappyHourPromotion = GlobalBasePromotion.discriminator(
  "globalHappyHour",
  new mongoose.Schema(
    {
      pointsMultiplier: { type: Number, default: 1 }, // for happy hour
    },
    { _id: false }
  )
);

module.exports = GlobalHappyHourPromotion;