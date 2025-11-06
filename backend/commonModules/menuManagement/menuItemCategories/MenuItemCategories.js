const mongoose = require("mongoose");

const menuItemCategoriesSchema = new mongoose.Schema(
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
  },
  {
    timestamps: true,
  }
);

const MenuItemCategories =
  mongoose.models.MenuItemCategories ||
  mongoose.model("MenuItemCategories", menuItemCategoriesSchema);

module.exports = MenuItemCategories;
