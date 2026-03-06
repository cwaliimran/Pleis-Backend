const Promotion = require("./BasePromotion");
const mongoose = require("mongoose");

const ClaimPromotion = Promotion.discriminator(
  "claimPromotion",
  new mongoose.Schema(
    {
      reward: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reward",
        required: true,
      },
      claimPoints: { type: Number, required: true },
    },
    { _id: false }
  )
);

module.exports = ClaimPromotion;
