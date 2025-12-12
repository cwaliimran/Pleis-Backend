const mongoose = require("mongoose");

const usersStreaksSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    companyOrganizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organizations", required: true },
    visits: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    points: { type: Number, default: 0 },

    lastVisitAt: { type: Date },

    // Dynamic points rules
    pointsRules: [
      {
        visits: { type: Number, required: true }, // e.g., 5th, 10th, 20th visit
        points: { type: Number, required: true }, // points to give on that visit
      }
    ],
  },
  { timestamps: true }
);

usersStreaksSchema.index(
  { user: 1, companyOrganizer: 1, organization: 1 },
  { unique: true }
);

const Streaks = mongoose.model("UsersStreaks", usersStreaksSchema);
module.exports = Streaks;
