const mongoose = require("mongoose");

const GlobalNotificationSchema = new mongoose.Schema(
  {

    destinationType: {
      type: String,
      enum: ["homeNotification", "organizationNotification", "eventNotification"],
      default: "homeNotification",
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Reference to the "User" model
      required: true, // Assuming a user is required for each update
    },
    title: {
      type: String,
      trim: true,
      required: true,
    },
    estimated: {
      type: Number,
      default: 0,
    },
    delivered: {
      type: Number, 
      default: 0,
    },
    message: {
      type: String,
      trim: true,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    // New Fields
    location: {
      city: {
        type: String, // Store the city name
        trim: true,
      },
      lat: {
        type: Number, // Store latitude
      },
      long: {
        type: Number, // Store longitude
      },
      radius: {
        type: Number, // Store the area in kilometers (numeric value)

      },

    },
    ageRange: {
      type: [Number], // Array to store min and max age (e.g., [18, 65])
    },
    gender: {
      type: String, // Can be 'All', 'Male', 'Female', etc.
      enum: ["all", "male", "female", "other"],
    },
    interests: [
      {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tags", // Reference to the "Tags" model


    },
    ],
    sendTiming: {
      type: String,
      enum: ["immediately", "schedule"], // Option to send immediately or schedule
      default: "immediately",
    },
    isDelivered: {
      type: Boolean,
      default: false,
    },
    scheduledDateTime: {
      type: Date,
      required: function () {
        return this.sendTiming === "schedule";
      },
      default: Date.now
    }
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
    discriminatorKey: "destinationType",
  }
);

// Create and export the GlobalNotification model
const GlobalNotification = mongoose.model("GlobalNotification", GlobalNotificationSchema);

module.exports = GlobalNotification; // Corrected export to match model name
