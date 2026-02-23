// models/ReservationNotificationLogs.js

const mongoose = require("mongoose");

/*
Even if:
- cron runs twice
- multiple servers are running
- job retries happen

Only one notification per reservation per type
*/

const ReservationNotificationLogSchema = new mongoose.Schema(
  {
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserReservations",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "RESERVATION_REMINDER_24H",
        "RESERVATION_REMINDER_2H",
        "RESERVATION_CONFIRMED",
        "RESERVATION_REJECTED",
        "RESERVATION_CANCELLED",
        "RESERVATION_MODIFIED",
      ],
      required: true,
    },

    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

ReservationNotificationLogSchema.index(
  { reservationId: 1, type: 1 },
  { unique: true } // prevents duplicate send
);

module.exports = mongoose.model(
  "ReservationNotificationLogs",
  ReservationNotificationLogSchema
);