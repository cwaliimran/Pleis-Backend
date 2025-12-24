const GlobalBase = require("./baseQR");
const mongoose = require("mongoose");

const Globalloyalty = GlobalBase.discriminator(
  "loyalty",
  new mongoose.Schema(
    {
       loyaltyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    },
    { _id: false }
  )
);

module.exports = Globalloyalty;