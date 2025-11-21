const mongoose = require("mongoose");

const menuItemCategoriesSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      default: "",
    },
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
    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
