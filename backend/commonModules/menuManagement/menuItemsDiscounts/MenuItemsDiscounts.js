
const mongoose = require("mongoose");

const DiscountType = {
  PERCENTAGE: "percentage",
  FIXED: "fixed",
};

const menuItemsDiscountsSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: Object.values(DiscountType),
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: function (value) {
          if (this.type === DiscountType.PERCENTAGE) {
            return value > 0 && value <= 100;
          }
          return value >= 0;
        },
        message:
          "Percentage discount must be greater than 0 and at most 100.",
      },
    },
    // Applies To — menu items covered by this discount
    menuItems: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "MenuItems",
      default: [],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "At least one menu item is required.",
      },
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "expired", "deleted"],
      default: "active",
    },
    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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

menuItemsDiscountsSchema.methods.isExpired = function () {
  return new Date() > this.endDate;
};

menuItemsDiscountsSchema.methods.isCurrentlyActive = function () {
  if (this.status !== "active") return false;
  const now = new Date();
  return now >= this.startDate && now <= this.endDate;
};

const MenuItemsDiscounts =
  mongoose.models.MenuItemsDiscounts ||
  mongoose.model("MenuItemsDiscounts", menuItemsDiscountsSchema);

module.exports = {
  MenuItemsDiscounts,
  DiscountType,
  ...require("./discountResolution"),
};
