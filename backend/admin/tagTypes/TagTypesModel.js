const mongoose = require("mongoose");

const tagtypesSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
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

const TagTypesModel = mongoose.model("TagTypes", tagtypesSchema);

module.exports = TagTypesModel;