const mongoose = require("mongoose");

const suppliersSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
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

const Suppliers = mongoose.model("Suppliers", suppliersSchema);

module.exports = Suppliers;
