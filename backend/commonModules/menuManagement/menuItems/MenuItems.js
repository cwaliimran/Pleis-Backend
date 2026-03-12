const mongoose = require("mongoose");

const menuItemsSchema = new mongoose.Schema(
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
    description: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      default: "",
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuIitetemCategories",
      required: true,
    },

    basePrice: {
      type: Number,
      default: 0,
    },
    taxPercent: {
      type: Number,
      default: 0,
    },

    menu: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Menus",
      required: true,
    },


    startTime: {
      type: Date,
      default: null,
    },


    endTime: {
      type: Date,
      default: null,
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


    //in case of limited time offer
    isLimitedTimeOffer: {
      type: Boolean,
      default: false,
    },
    isScheduled: {
      type: Boolean,
      default: false,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Events",
      default: null,
    },
    availabilityType: {
      type: String,
      enum: ['preOrdersOnly', 'preOrdersEvent', 'preOrderExclusive'],
      default: null
    },
    upSellItem: {
      type: Boolean,
      default: false,
    },
    isAvailableInStock: {
      type: Boolean,
      default: true,
    },

  },
  {
    timestamps: true,
  }
);

const MenuItems = mongoose.model("MenuItems", menuItemsSchema);

module.exports = MenuItems;
