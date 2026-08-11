const mongoose = require("mongoose");
const { customAlphabet } = require("nanoid");
const generateShortId = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  6,
);

const UserReservationsSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      index: true,
      default: () => `RSV-${generateShortId()}`, //RSV for Reservation Booking
    },

    userId: {
      // the user who made the reservation if null then it's a walk-in reservation booked by staff
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
    reservationType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReservationType",
      required: true,
    },
    partySize: {
      type: Number,
      default: 0,
    },
    numberOfTables: {
      type: Number,
      default: 0,
    },
    occasion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Occasion",
      default: null,
    },
    amount: {
      type: Number,
      default: 0,
    },
    priceBreakDown: {
      type: Object,
      default: {},
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    reservationId: {
      //if this is null then it's a standalone reservation added by staff for user
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservations",
      default: null,
    },
    reservationSnapshot: {
      type: Object,
      default: {},
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
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    email: { type: String, default: "" },
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

    status: {
      type: String,
      enum: [
        "pendingPayment",
        "needsConfirmation",
        "confirmed",
        "checkedIn",
        "rejected",
        "cancelled",
        "completed",
        "deleted",
      ],
      default: "confirmed",
    },

    paymentDetails: {
      cardId: { type: String, default: null },
      transactionId: { type: String, default: null }, // gateway ref
      paymentMethod: {
        type: String,
        enum: ["applePay", "card", "cash"],
        required: false,
      },
      paymentStatus: {
        type: String,
        enum: ["pending", "paid", "failed", "refunded"],
        default: "pending",
        index: true,
      },
    },

    lockUntil: {
      type: Date,
      index: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    //menu item orders associated with this reservation when preOrdering is enabled against event
    preOrderMenuItemsOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuOrders",
      default: null,
    },
    // Ticketing references (for combined booking)
    ticketingOrderRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TicketingOrder",
      default: null,
      index: true, // important for refunds & accounting
    },

    ticketingBookingRefs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TicketingBookings",
        index: true, // enables fast reverse lookup
      },
    ],

    reservationChanges: [
      {
        // who performed the change
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null, // null = system/staff/walk-in
        },

        // previous confirmed timing
        oldTiming: {
          type: Object,
          default: null,
        },

        // proposed timing
        newTiming: {
          type: Object,
          default: null,
        },

        // what type of action
        action: {
          type: String,
          enum: [
            "timingChanged", // organizer updated time
            "accepted", // user accepted change
            "cancelled", // user cancelled reservation
            "refundRequested", // user asked refund
            "refundProcessed", // admin refunded
          ],
          required: true,
        },

        // state of change
        status: {
          type: String,
          enum: [
            "pending", // waiting user decision
            "accepted",
            "rejected",
            "completed",
          ],
          default: "completed",
        },

        reason: {
          type: String,
          default: "",
        },

        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    voucher: {
      code: { type: String, default: () => `ORD-${generateShortId()}` },
      status: {
        type: String,
        enum: [null, "pending", "applied", "expired", "cancelled"],
        default: null,
      },
      discountAmount: { type: Number, default: 0 },
    },

    userBillingInformation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserBillingInformation",
      default: null,
    },
  },

  {
    timestamps: true,
  },
);

UserReservationsSchema.index({
  status: 1,
  userId: 1,
  "timingSlots.dateTimeSlots.timeSlots.startTime": 1,
});

const UserReservations = mongoose.model(
  "UserReservations",
  UserReservationsSchema,
);

module.exports = { UserReservations };
