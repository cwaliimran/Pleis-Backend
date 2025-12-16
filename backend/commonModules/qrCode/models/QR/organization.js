const GlobalBase = require("./baseQR");
const mongoose = require("mongoose");

const GlobalOrganization = GlobalBase.discriminator(
  "organization",  
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

module.exports = GlobalOrganization;
