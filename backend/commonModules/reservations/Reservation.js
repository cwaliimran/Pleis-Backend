const mongoose = require("mongoose");

const ReservationsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Reference to the "User" model
      required: true, // Assuming a user is required for each reservation
    },
    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Reference to the "User" model
      required: true, // Assuming a user is required for each reservation
    },
    reservationType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReservationType", // Reference to the "ReservationType" model
      required: true,
    },
    ticketRequirement: {
      type: Boolean,
      default: false,
    },
    reservationSource: {
      type: String,
      enum: [
        "auto", //booked by user from app
        "manual", // added by staff from staff app
      ],
      default: "auto",
    },

    availableReservations: {
      type: Number,
      default: 0,
    },

    maxCapacityPerReservation: {
      type: Number,
      default: 0,
    },

    conditionType: {
      type: String,
      enum: [
        "fixedPrice",
        "minimumSpendOnLocation",
        "prepayOption",
        "noCondition",
        "customText",
      ],
      default: "noCondition",
    },

    amount: {
      type: Number,
      min: [0, "Amount must be positive"],
      required: function () {
        return [
          "fixedPrice",
          "minimumSpendOnLocation",
          "prepayOption",
        ].includes(this.conditionType);
      },
      default: 0,
    },

    customText: {
      type: String,
      trim: true,
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    ticketType: {
      type: String,
      enum: ["vipEventPass", "generalAdmission", "premiumAccess"],
      trim: true,
      default: null,
    },

    customText: {
      type: String,
      trim: true,
    },

    taxPercentage: {
      type: String,
      trim: true,
      required: true,
      default: "",
    },
    timingSlots: {
      enabled: {
        type: Boolean,
        default: false,
      },
      dateTimeSlots: {
        type: [
          {
            date: { type: Date, },
            timeSlots: [
              {
                startTime: { type: Date, },
                endTime: { type: Date, },
              }
            ]
          }
        ],
        default: [],
      },
    },
    needsConfirmation: {
      type: Boolean,
      required: true,
      default: false,
    },

    optionalEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "events",
    },

    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    allowPreOrderMenuItems: {
      type: Boolean,
      default: false,
    },
    bonusPoints: {
      type: Number,
      default: 0,
    },
  },

  {
    timestamps: true,
  }
);

ReservationsSchema.index({ optionalEventId: 1 });

const Reservations = mongoose.model("Reservations", ReservationsSchema);

module.exports = Reservations;
