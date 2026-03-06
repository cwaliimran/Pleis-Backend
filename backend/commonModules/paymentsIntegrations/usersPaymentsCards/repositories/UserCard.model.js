const mongoose = require("mongoose");

const userCardSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    panToken: {
      type: String,
      required: true,
    },

    maskedPan: {
      type: String,
      required: true
    },

    brand: {
      type: String,
      enum: ["visa", "mastercard", "amex", "discover", "unknown"],
      default: "unknown"
    },

    isDefault: {
      type: Boolean,
      default: false
    },

    lastUsedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

userCardSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("UserCard", userCardSchema);