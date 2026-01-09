const mongoose = require("mongoose");

const menuItemssaleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
        default: "fixed",
    },
    discountValue: {
      type: Number,
      default: 0,
    },
    menuItems: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItems",
      required: true,
    }],
    startDateTime: {
      type: Date,
      default: null,
      required: true,
    },
    endDateTime: {
      type: Date,
      default: null,
        required: true,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
const MenuItemsSale = mongoose.models.MenuItemsSale || mongoose.model("MenuItemsSale", menuItemssaleSchema);

module.exports = MenuItemsSale;
