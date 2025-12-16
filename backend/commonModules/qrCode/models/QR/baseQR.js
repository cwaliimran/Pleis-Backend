const mongoose = require("mongoose");
const globalQrSchema = new mongoose.Schema(
  {
    image: { type: String, default: "" },
    label: { type: String, trim: true, required: true },

    // Define the type of global QR promotion
    globalQrType: {
      type: String,
      required: true,
      enum: ["organization", "event", "loyalty", "checkInOrder", "checkInTableID"],  // Include types related to QR codes
    },

    status: {
      type: String,
      enum: ["active", "inactive", "completed", "deleted"],
      default: "active",
    },
  },
  {
    timestamps: true,
    discriminatorKey: "globalQrType",  
  }
);

module.exports =
  mongoose.models.GlobalQr ||
  mongoose.model("GlobalQr", globalQrSchema);
