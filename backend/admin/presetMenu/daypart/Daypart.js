const mongoose = require("mongoose");

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
      type: String,
      trim: true,
    },
    endTime: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);
daypartSchema.index(
  { user: 1, startTime: 1, endTime: 1 },
  {
    unique: true,
    partialFilterExpression: {
      startTime: { $type: "string" },
      endTime: { $type: "string" },
    },
  },
);

module.exports = mongoose.model("Daypart", daypartSchema);
