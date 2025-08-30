const mongoose = require("mongoose");

const tagsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    type: {
      type: String,
      default: "",
    },
    pinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Tags = mongoose.model("Tags", tagsSchema);

module.exports = Tags;
