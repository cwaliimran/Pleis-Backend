const GlobalBase = require("./baseQR");
const mongoose = require("mongoose");
const GlobalEvent = GlobalBase.discriminator(
  "event",
  new mongoose.Schema(
    {
  eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event",
        required: true,
      },
    },
    { _id: false }
  )
);
module.exports = GlobalEvent;
