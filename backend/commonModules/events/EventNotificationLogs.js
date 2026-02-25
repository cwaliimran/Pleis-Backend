// models/EventNotificationLogs.js
const mongoose = require("mongoose");

/* 
Even if cron runs twice

Even if multiple servers

Only one notification per event per type
*/
const EventNotificationLogSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    index: true,
  },
  type: {
    type: String,
    enum: [
      "24H",
      "2H",
      "STARTED"
    ],
    required: true,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

EventNotificationLogSchema.index(
  { eventId: 1, type: 1 },
  { unique: true } // prevents duplicate send
);

module.exports = mongoose.model(
  "EventNotificationLogs",
  EventNotificationLogSchema
);


