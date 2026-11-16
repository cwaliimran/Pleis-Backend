const GlobalBase = require("./baseQR");
const mongoose = require("mongoose");

// Table code: one code per table. A table is a "tableDelivery" delivery option
// of the venue's organization, so scanning checks the guest in and fills that
// table in for delivery (Defects Report D-01).
const GlobalTableSchema = new mongoose.Schema(
  {
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venues",
      required: true,
    },
    deliveryOptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryOptions",
      default: null,
    },
    // The table's title at the time the code was made, printed on the label.
    tableLabel: { type: String, trim: true, default: "" },
    // Legacy free-text table number (codes made before tables were picked from
    // the delivery options).
    tableNo: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    _id: false,
  }
);

const GlobalTable = GlobalBase.discriminator("checkInTableID", GlobalTableSchema);

module.exports = GlobalTable;
