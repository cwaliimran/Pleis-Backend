const mongoose = require("mongoose");

const PriceMode = {
  FIXED_COMBO_PRICE: "fixed_combo_price",
  PERCENTAGE_OFF_SUM: "percentage_off_sum",
  FIXED_AMOUNT_OFF_SUM: "fixed_amount_off_sum",
};

const menuItemsCombosSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItemSubCategory",
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    menuItems: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "MenuItems",
      default: [],
      validate: {
        validator: (items) => Array.isArray(items) && items.length >= 2,
        message: "At least two menu items are required for a combo.",
      },
    },
    priceMode: {
      type: String,
      enum: Object.values(PriceMode),
      default: PriceMode.FIXED_COMBO_PRICE,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "notOrderable", "inactive", "deleted"],
      default: "active",
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

menuItemsCombosSchema.methods.isCurrentlyActive = function () {
  return this.status === "active";
};

const MenuItemsCombos =
  mongoose.models.MenuItemsCombos ||
  mongoose.model("MenuItemsCombos", menuItemsCombosSchema);

module.exports = {
  MenuItemsCombos,
  PriceMode,
};

/* 
fixed_combo_price: the price of the combo is a fixed price
percentage_off_sum: the price of the combo is a percentage off the sum of the menu items
fixed_amount_off_sum: the price of the combo is a fixed amount off the sum of the menu items  

*/
