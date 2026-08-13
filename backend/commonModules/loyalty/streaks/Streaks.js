const mongoose = require("mongoose");

const streaksSchema = new mongoose.Schema(
  {
    countBase: {
      type: String,
      enum: ["day", "week", "month"],
      required: true,
    },
    badges: [
      {
        title: {
          type: String,
          enum: ["bronze", "silver", "gold", "platinum"],
          required: true,
        },
        visits: {
          type: Number,
          required: true, // e.g. on the 5th, 10th, or 20th visit
          min: 1,
        },
      },
    ],
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
  },
);

streaksSchema.index(
  { companyOrganizer: 1, },
  { unique: true, partialFilterExpression: { status: "active" } }
);

const Streaks = mongoose.model("Streaks", streaksSchema);

module.exports = Streaks;
