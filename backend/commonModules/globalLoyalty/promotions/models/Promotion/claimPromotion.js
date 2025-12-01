const GlobalBasePromotion = require("./basePromotion");
const mongoose = require("mongoose");

const GlobalClaimPromotion = GlobalBasePromotion.discriminator(
  "globalClaimPromotion",
  new mongoose.Schema(
    {
      reward: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Rewards",
        required: true,
      },
      claimPoints: { type: Number, required: true },
    },
    { _id: false }
  )
);

module.exports = GlobalClaimPromotion;
