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
      bookingOpensAfterMinutes: {
        type: Number,
        default: 0,
      },
      bookingClosesBeforeMinutes: {
        type: Number,
        default: 0,
      },
      averageSlotDurationInMinutes: {
        type: Number,
        default: 0,
      },
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
    // #93 / Reservations prototype v3.2: staff may mark a Confirmed reservation
    // as No-show only once this grace period after the slot start has passed.
    // No-show is never set automatically.
    noShowPolicy: {
      gracePeriodMinutes: {
        type: Number,
        enum: [15, 30, 45, 60],
        default: 30,
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
