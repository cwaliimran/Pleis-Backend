const mongoose = require("mongoose");

const UserReservationsSchema = new mongoose.Schema(
  {
    userId: { // the user who made the reservation if null then it's a walk-in reservation booked by staff
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    transferHistory: {
      type: [
        {
          fromUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          toUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          transferDate: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
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
    amount: {
      type: Number,
      min: [0, "Price must be positive"],
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    reservationId: { //if this is null then it's a standalone reservation added by staff for user
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservations",
      default: null,
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
    firstName: { type: String, default: "", },
    lastName: { type: String, default: "", },
    phoneNumber: {
      code: {
        // Country code for phone number
        type: String,
        default: "",
      },
      number: {
        // Phone number without country code
        type: String,
        default: "",
      },
      default: {},
    },

    optionalEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "events",
    },

    notes: {
      type: String,
      default: "",
    },

    reservationStatus: {
      type: String,
      enum: ["confirmed", "checkedIn", "rejected", "pending", "cancelled", "completed"],
      default: "pending",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },

    paymentMethod: {
      type: String, required: true,
      enum: ["applePay", "card", "cash", "payLater"], default: "payLater"
    },
    paymentId: { type: String, default: null },

    //with payLater user can add more items to cart
    // for applePay/card order can't be cancelled
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    paidAt: {
      type: Date,
      default: null,
    },
    transactionId: {
      type: String,
      default: null,
      index: true,
    },

    //menu item orders associated with this reservation when preOrdering is enabled against event
    preOrderMenuItemsOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuOrders",
      default: null,
    }
  },

  {
    timestamps: true,
  }
);

const UserReservations = mongoose.model("UserReservations", UserReservationsSchema);

module.exports = { UserReservations };
