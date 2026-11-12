const GlobalBase = require("./baseQR");
const mongoose = require("mongoose");

// Link issued by the share button on a reservation screen (#83). Not one of
// the five printable codes, so it never appears on the QR codes page.
const GlobalReservation = GlobalBase.discriminator(
  "reservation",
  new mongoose.Schema(
    {
      reservationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "UserReservations",
        required: true,
      },
    },
    { _id: false }
  )
);

module.exports = GlobalReservation;
