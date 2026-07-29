const mongoose = require("mongoose");

/**
 * startTime / endTime store UTC minutes of day (0–1439), same pattern as
 * shared/commonSchemas/operatingHours.js — recurring daily windows, not Dates.
 * API accepts/returns local "HH:mm" (or "hh:mm A"); convert at the controller boundary.
 */
const daypartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    isAllDay: {
      type: Boolean,
      default: false,
    },
    startTime: {
      type: Number,
      default: null,
      min: 0,
      max: 1439,
    },
    endTime: {
      type: Number,
      default: null,
      min: 0,
      max: 1439,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Daypart", daypartSchema);
