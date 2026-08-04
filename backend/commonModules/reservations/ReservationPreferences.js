const mongoose = require("mongoose");

const ReservationPreferencesSchema = new mongoose.Schema(
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
    isReservationEnabled: {
      type: Boolean,
      default: true,
    },
    timeSlotsSetting: {
      status: {
        type: String,
        enum: ["enabled", "disabled"],
        default: "enabled",
      },
      bookingOpensAfterHours: {
        type: Number,
        default: 0,
      },
      bookingClosesBeforeHours: {
        type: Number,
        default: 0,
      },
      automaticResponse: {
        autoAccept: {
          type: Boolean,
          default: false,
        },
        autoReject: {
          type: Boolean,
          default: false,
        },
        maxGuestPerReservationForAutoAccept: {
          type: Number,
          default: 0,
        },
      },
    },
    cancellationPolicy: {
      status: {
        type: String,
        enum: ["enabled", "disabled"],
        default: "disabled",
      },
      hoursBeforeReservation: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  },
);

ReservationPreferencesSchema.index({ organization: 1 });

const ReservationPreferences = mongoose.model(
  "ReservationPreferences",
  ReservationPreferencesSchema,
);

module.exports = ReservationPreferences;
