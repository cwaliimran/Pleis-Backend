const mongoose = require("mongoose");

const occasionSchema = new mongoose.Schema(
  {
    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    }
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Occasion", occasionSchema);
