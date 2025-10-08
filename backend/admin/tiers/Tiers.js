const mongoose = require("mongoose");

const tiersSchema = new mongoose.Schema(
  {

    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
    },

    entryPoints: {
      type: Number,
      default: 0,
    },
    retainPoints: {
      type: Number,
      default: 0,
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


const Tiers = mongoose.model("Tiers", tiersSchema);

module.exports = Tiers;
