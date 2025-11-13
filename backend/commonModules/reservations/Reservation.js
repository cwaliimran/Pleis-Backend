const mongoose = require("mongoose");

const ReservationsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Reference to the "User" model
      required: true, // Assuming a user is required for each reservation
    },
    name: {
      type: String,
      trim: true,
      required: true,
      default: "",
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
        "ticketRequirement",
        "customText",
      ],
      default: "noCondition",
    },

    amount: {
      type: Number,
      required: function () {
        return this.conditionType === "fixedPrice";
      },
      min: [0, "Price must be positive"],
    },

    amount: {
      type: Number,
      required: function () {
        return this.conditionType === "minimumSpendOnLocation";
      },
      min: [0, "Minimum spend must be positive"],
    },

    amount: {
      type: Number,
      required: function () {
        return this.conditionType === "prepayOption";
      },
      min: [0, "Prepay amount must be positive"],
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    ticketType: {
      type: String,
      enum: ["vipEventPass", "generalAdmission", "premiumAccess"],
      required: function () {
        return this.conditionType === "ticketRequirement";
      },
      trim: true,
    },

    customText: {
      type: String,
      required: function () {
        return this.conditionType === "customText";
      },
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
      type: String,
      default: "",
    },


    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
  },

  {
    timestamps: true,
  }
);

const Reservations = mongoose.model("Reservations", ReservationsSchema);

module.exports = Reservations;
