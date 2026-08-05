const mongoose = require("mongoose");

const reservationTypeSchema = new mongoose.Schema(
  {
    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    tax: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      default: null,
      trim: true,
    },

    numberOfTables: {
      type: Number,
      required: true,
    },
    maxCapacity: {
      type: Number,
      required: true,
    },
    maxPartySize: {
      type: Number,
      required: true,
    },
    conditionType: {
      type: String,
      enum: ["free", "minimumSpend"],
      default: "free",
    },
    bonosPoints: {
      type: Number,
      default: 0,
    },
    isVisibleToGuest: {
      type: Boolean,
      default: true,
    },
    notes: [
      {
        type: String,
        trim: true,
      },
    ],
    requireConfirmationToApprove: {
      type: Boolean,
      default: false,
    },
    occasionRequired: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("ReservationType", reservationTypeSchema);
