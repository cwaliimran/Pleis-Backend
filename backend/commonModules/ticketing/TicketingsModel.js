const mongoose = require("mongoose");

const protectionTypes = [
  "none", // None
  "nameSurname", // Name + Surname
  "nameSurnamePid", // Name + Surname + PID of Birth
];

const ticketingsSchema = new mongoose.Schema(
  {
    //required fields
    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
    },
    quantity: {
      type: Number,
      required: true,
      default: 0,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    taxPercentage: {
      type: Number,
      required: true,
      default: 0,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    //optional fields
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
                quantity: { type: Number, default: 0 },
                startTime: { type: Date, },
                endTime: { type: Date, },
              }
            ]
          }
        ],
        default: [],
        _id: false,
      },
    },

    repeatable: {
      isRepeatable: {
        type: Boolean,
        default: false,
      },
      visits: {
        type: Number,
        default: 1,
      }
    },

    resaleProtection: {
      type: String,
      enum: protectionTypes,
      default: "none",
    },
    transferFee: {
      type: Number,
      default: 0,
    },


    timeSensitivePricing: {
      earlyBird: {
        endDate: { type: Date, default: null },
        discountedPrice: { type: Number, default: 0 },
      },
      lastMinute: {
        startDate: { type: Date, default: null },
        discountedPrice: { type: Number, default: 0 },
      }
    },

    fastTrackEntry: {
      enabled: {
        type: Boolean,
        default: false,
      },
      quantity: {
        type: Number,
        default: 0,
      },
      extraPrice: {
        type: Number,
        default: 0,
      }
    },

    requiresReservation: {
      enabled: {
        type: Boolean,
        default: false,
      },
      type: {
        type: String,
        enum: ["", "any", "table", "vip", "booth"],
        default: "",
      }
    },

    status: { //publishingOptions
      type: String,
      //active/instant , inactive/manual
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    scheduledPublishAt: {
      type: Date,
      default: null,
    },
    recurringMeta: {  // only for recurring events
      isTemplate: {
        type: Boolean,
        default: false,
        index: true,
      },

      parentTicket: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ticketings",
        default: null,
        index: true,
      },

      occurrenceIndex: {
        type: Number,
        default: 1,
      }
    },

  },
  {
    timestamps: true,
  }
);
ticketingsSchema.index({ event: 1, status: 1 });

const TicketingsModel = mongoose.model("Ticketings", ticketingsSchema);

module.exports = TicketingsModel;
