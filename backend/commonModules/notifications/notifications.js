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
      area: {
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
    interests: {
      type: [String], // Array to store multiple interests (e.g., Music, Sports, etc.)
      enum: ["Music", "Sports", "Art", "Food & Drink", "Comedy", "Theater", "Festivals", "Nightlife", "Family", "Education", "Business", "Technology"],
    },
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
