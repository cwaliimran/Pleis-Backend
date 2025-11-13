const mongoose = require("mongoose");

const UserReservationsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, 
    },

    partySize: {
      type: Number,
      default: 0,
    },

    reservationType: {
      type: String,
      enum: [
        "regular",
        "vip",
        "outdoor",
        "private",
        "bar",
        "window",
      ],
      default: "regular",
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
      companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Reference to the "User" model
      required: true, // Assuming a user is required for each reservation
    },

    timingSlots: {

      dateTimeSlots: {
        type: [
          {
            date: { type: Date },
            timeSlots: [
              {
                startTime: { type: Date },
                endTime: { type: Date },
              },
            ],
          },
        ],
        default: [],
      },
    },


optionalEventId: {
      type: String,
      default: "",
    },

  reservationStatus: {
    type: String,
    enum: ["confirmed", "rejected", "pending", "cancelled"],
    default: "pending",
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

const UserReservations = mongoose.model("UserReservations", UserReservationsSchema);

module.exports = UserReservations;
