const GlobalNotification = require("./notifications");
const mongoose = require("mongoose");
const GlobalNotificationEvent = GlobalNotification.discriminator(
  "eventNotification",
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
module.exports = GlobalNotificationEvent;
