const mongoose = require("mongoose");

const userLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    deviceId: {
      type: String,
      default: null,
    },
    deviceType: {
      type: String,

    },
    status: {
      type: String,
      enum: ["success", "failed"],
      default: "success",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("UserLogs", userLogSchema);

