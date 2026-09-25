const mongoose = require("mongoose");

const userLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

userLogSchema.index({ user: 1, lastLogin: -1 });

module.exports = mongoose.model("UserLogs", userLogSchema);

