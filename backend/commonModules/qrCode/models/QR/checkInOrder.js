const GlobalBase = require("./baseQR");
const mongoose = require("mongoose");

const GlobalProductSalePromotion = GlobalBase.discriminator(
  "checkInOrder",
  new mongoose.Schema(
    {
      venueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Venues",
        required: true,
      },
    },
    { _id: false }
  )
);

module.exports = GlobalProductSalePromotion;
