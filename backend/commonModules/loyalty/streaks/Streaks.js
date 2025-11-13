const mongoose = require("mongoose");

const streaksSchema = new mongoose.Schema(
  {

    visits: {
      type: Number,
      required: true, // e.g. on the 5th, 10th, or 20th visit
    },
    points: {
      type: Number,
      required: true, // how many points to give on that visit
    },
    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

streaksSchema.index({ companyOrganizer: 1, visits: 1 }, { unique: true });

const Streaks = mongoose.model("Streaks", streaksSchema);

module.exports = Streaks;
