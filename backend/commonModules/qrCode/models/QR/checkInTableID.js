const GlobalBase = require("./baseQR");
const mongoose = require("mongoose");

// Define the schema for GlobalOrganization
const GlobalOrganizationSchema = new mongoose.Schema(
  {
      venueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Venues",
        required: true,
      },
    tableNo: { 
      type: Number, 
      required: true 
    },
  },
  {
    timestamps: true,  // You can include timestamps if needed
    _id: false, // If you do not want the discriminator to generate _id field
  }
);

// Create the discriminator for GlobalOrganization
const GlobalOrganization = GlobalBase.discriminator(
  "checkInTableID",  // The name of the discriminator model
  GlobalOrganizationSchema
);

module.exports = GlobalOrganization;
