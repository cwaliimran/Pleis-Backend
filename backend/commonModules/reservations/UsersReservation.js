const mongoose = require("mongoose");
const { customAlphabet } = require("nanoid");
const generateShortId = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);

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
      default: null,
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
      ref: "Organizations",
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
    bookingDuration: {
      type: String,
      default: "slots",
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
        "noShow",
        "rejected",
        "cancelled",
        // Legacy only (#54): Completed is removed from the lifecycle and never set.
        // Kept in the enum so historic rows still validate on save.
        "completed",
        "deleted",
      ],
      default: "confirmed",
    },

    // Show / No-show audit (#92, #93, checklist IAO-34): who set it, when, at which venue.
    checkInRecord: {
      at: { type: Date, default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      venue: { type: mongoose.Schema.Types.ObjectId, ref: "Organizations", default: null },
      // staff = staff app / staff action, admin = admin panel, guest = app check-in, scan = reservation QR
      via: { type: String, enum: [null, "staff", "admin", "guest", "scan"], default: null },
    },
    noShowRecord: {
      at: { type: Date, default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      venue: { type: mongoose.Schema.Types.ObjectId, ref: "Organizations", default: null },
      via: { type: String, enum: [null, "staff", "admin"], default: null },
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
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    // Set when a plain (non-fiscal) free-reservation confirmation email is sent
    plainConfirmationEmailSentAt: {
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
          default: null, // null = system
        },

        // type of change
        action: {
          type: String,
          enum: [
            "timingChanged",
            "reservationStatusChanged",
            "paymentStatusChanged",
            "cancelled",
            "refundRequested",
            "refundProcessed",
          ],
          required: true,
        },

        // previous value
        oldValue: {
          type: String,
          default: null,
        },

        // new value
        newValue: {
          type: String,
          default: null,
        },

        // optional reason
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
        // forfeited: minimum spend voucher retained by the organizer on a no-show (#55)
        enum: [null, "pending", "applied", "expired", "cancelled", "forfeited"],
        default: null,
      },
      discountAmount: { type: Number, default: 0 },
      usedAmount: { type: Number, default: 0 },
      // Legacy field; reservation_confirmation + PLS voucher now issue at payment
      // (reservation finalizer / webhook). Ordering with voucher issues ordering_confirmation.
      fiscalDocumentEnqueuedAt: { type: Date, default: null },
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

const UserReservations = mongoose.model("UserReservations", UserReservationsSchema);

/** Statuses that hold seats / count toward booked capacity & occupancy. */
const CAPACITY_CONSUMING_STATUSES = [
  "pendingPayment",
  "needsConfirmation",
  "confirmed",
  "checkedIn",
];

/** Statuses that must never increment reserved / occupancy counts. */
const NON_CAPACITY_STATUSES = [
  "cancelled",
  "rejected",
  "deleted",
  "completed",
  "noShow",
];

module.exports = {
  UserReservations,
  CAPACITY_CONSUMING_STATUSES,
  NON_CAPACITY_STATUSES,
};
