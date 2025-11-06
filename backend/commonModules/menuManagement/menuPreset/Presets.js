const mongoose = require("mongoose");
const presetsSchema = new mongoose.Schema(
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
    basePrice: {
      type: String,
      default: "0",
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



const Presets = mongoose.model("Presets", presetsSchema);

module.exports = Presets;
