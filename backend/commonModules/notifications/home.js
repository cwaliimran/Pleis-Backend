const notification = require("./notifications");
const mongoose = require("mongoose");
const GlobalNotificationhome = notification.discriminator(
  "homeNotification",
  new mongoose.Schema(
    { _id: false }
  )
);
module.exports = GlobalNotificationhome;
