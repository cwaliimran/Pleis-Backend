const mongoose = require("mongoose");

const globalStreaksSchema = new mongoose.Schema(
  {

    visits: {
      type: Number,
      required: true, // e.g. on the 5th, 10th, or 20th visit
    },
    points: {
      type: Number,
      required: true, // how many points to give on that visit
    },
    companyOrganizer: {
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

globalStreaksSchema.index(
  { companyOrganizer: 1, visits: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" }
  }
);


const GlobalStreaks = mongoose.model("GlobalStreaks", globalStreaksSchema);

module.exports = GlobalStreaks;
