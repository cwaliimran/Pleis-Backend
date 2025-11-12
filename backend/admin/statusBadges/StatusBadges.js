const mongoose = require("mongoose");

const statusBadgesSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      default: "",
    },
    backgroundImage: {
      type: String,
      default: "",
    },
    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
    },
    entryPoints: {
      type: Number,
      default: 0,
    },
    retainPoints: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);


const StatusBadges = mongoose.model("StatusBadges", statusBadgesSchema);

module.exports = StatusBadges;
