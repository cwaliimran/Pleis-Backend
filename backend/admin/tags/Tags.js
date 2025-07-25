const mongoose = require("mongoose");

const tagsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
      unique: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
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
