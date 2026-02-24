const GlobalBasePromotion = require("./basePromotion");
const mongoose = require("mongoose");

const GlobalClaimPromotion = GlobalBasePromotion.discriminator(
  "globalClaimPromotion",
  new mongoose.Schema(
    {
      reward: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "GlobalReward",
        required: true,
      },
      ticket: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ticketings",
        required: true,
      },
      timeSlot: {
        type: String,
        default: null,
      },
      isFastTrack: {
        type: Boolean,
        default: false,
      },
      claimPoints: { type: Number, required: true },
    },
    { _id: false }
  )
);

module.exports = GlobalClaimPromotion;
