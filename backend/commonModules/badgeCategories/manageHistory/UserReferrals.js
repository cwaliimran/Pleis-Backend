const mongoose = require("mongoose");

const UserReferralsSchema = new mongoose.Schema({

  referrer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true
  },

  referredUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    unique: true
  }

}, { timestamps: true });

module.exports = mongoose.model(
  "UserReferrals",
  UserReferralsSchema
);