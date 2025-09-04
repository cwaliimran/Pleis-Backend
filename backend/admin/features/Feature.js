const mongoose = require("mongoose");

const FEATURE_KEYS = [
  "ticketing",
  "reservationManagement",
  "loyaltyScanning",
  "inAppOrdering"
];

const FEATURE_STATUS = [
  "active",
  "inactive",
  "deleted"
];

const featureSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
    },
    key: {
      type: String,
      enum: FEATURE_KEYS,
      default: "ticketing",
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },
    status: {
      type: String,
      enum: FEATURE_STATUS,
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

const Features = mongoose.model("Feature", featureSchema);

module.exports = {
  Features,
  FEATURE_KEYS,
  FEATURE_STATUS,
}
