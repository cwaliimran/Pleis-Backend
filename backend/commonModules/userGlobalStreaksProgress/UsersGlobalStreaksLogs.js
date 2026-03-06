const mongoose = require("mongoose");

const UsersGlobalStreakLogsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  action: {
    type: String,
    enum: ["increment", "reset"]
  },

  previousStreak: Number,

  newStreak: Number,

  reason: String
}, { timestamps: true });

module.exports = mongoose.model("UsersGlobalStreakLogs", UsersGlobalStreakLogsSchema);