const mongoose = require("mongoose");

const menusSchema = new mongoose.Schema(
  {


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
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
      required: true,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User",
      required: true,
    },
isOrderingEnabled: {
      type: Boolean,
      default: true,
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

const Menus = mongoose.model("Menus", menusSchema);

module.exports = Menus;
