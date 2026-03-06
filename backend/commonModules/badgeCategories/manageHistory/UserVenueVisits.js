const mongoose = require("mongoose");

const UserVenueVisitsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true
  },

  venue: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Venues",
    index: true
  },

  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organizations"
  },

  visitCount: {
    type: Number,
    default: 1
  },

  lastVisitAt: {
    type: Date,
    default: Date.now
  }

}, { timestamps: true });

UserVenueVisitsSchema.index(
  { user: 1, venue: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "UserVenueVisits",
  UserVenueVisitsSchema
);