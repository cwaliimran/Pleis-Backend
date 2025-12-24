const GlobalNotification = require("./notifications");
const mongoose = require("mongoose");

const GlobalNotificationOrganization = GlobalNotification.discriminator(
  "organizationNotification",  
  new mongoose.Schema(
    {
      organizationId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "organizations",  // Reference to the Organizations collection
        required: true 
      },
    },
    { _id: false }
  )
);

module.exports = GlobalNotificationOrganization;
  