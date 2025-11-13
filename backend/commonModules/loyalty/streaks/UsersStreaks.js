const mongoose = require("mongoose");

const usersStreaksSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    companyOrganizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    visits: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    lastVisitAt: { type: Date },
  },
  { timestamps: true }
);

usersStreaksSchema.index({ user: 1, companyOrganizer: 1 }, { unique: true });

const UsersStreaks = mongoose.model("UsersStreaks", usersStreaksSchema);
module.exports = UsersStreaks;
