const mongoose = require("mongoose");

const menuItemSubCategoryTypeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItemSubCategory",
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

module.exports = mongoose.model(
  "MenuItemSubCategoryType",
  menuItemSubCategoryTypeSchema,
);
