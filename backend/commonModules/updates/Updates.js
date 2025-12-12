const mongoose = require("mongoose");

const UpdatesSchema = new mongoose.Schema(
  {
    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Reference to the "User" model
      required: true, // Assuming a user is required for each update
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event", // Reference to the "Event" model
      required: true,
    },
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
    image: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// Create and export the Updates model
const Updates = mongoose.model("Updates", UpdatesSchema);

module.exports = Updates;  // Corrected export to match model name
