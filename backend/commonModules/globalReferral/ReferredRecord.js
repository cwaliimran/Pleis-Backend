const mongoose = require('mongoose');

// Define the new schema
const referredRecordSchema = new mongoose.Schema(
  {
    userIp: {
      type: String,
      required: true,
      unique: true,  // Ensure unique IP addresses for each record
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",  // Reference to the Users model
      default: null,
    },

    referrerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",  // Reference to the Users model
      default: null,
    },

    referrerUserName: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: ["global", "custom", "invite"],
      default: "global",  // Default to "global" referral type
    },

    purchases: {
      type: Number,
      default: 0,  // Default to 0 if not provided
    },

    purchased: {
      type: Boolean,
      default: false,  // Default to false (will be set to true if purchases >= 3)
    },
    expiryDate: {
      type: Date,
      required: true, // Expiry date must be provided
    },

    userReward: {
      type: Number,
      default: 0,  // Default to 0 if not provided
    },

    referrerReward: {
      type: Number,
      default: 0,  // Default to 0 if not provided
    },

    // Add status field with enum for active or inactive
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',  // Default to 'active' status
    },
  },
  { timestamps: true }  // Automatically add createdAt and updatedAt
);

// Pre-save hook to handle business logic before saving
referredRecordSchema.pre('save', function (next) {
  // Set purchased to true if purchases >= 3
  if (this.purchases >= 3 && !this.purchased) {
    this.purchased = true;  // Set purchased to true if purchases >= 3
  }

  // Check if the record is older than 15 days from the createdAt field and no purchases made
  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

  // If the record was created more than 15 days ago and there have been no purchases, set status to inactive
  if (this.purchases === 0 && this.createdAt < fifteenDaysAgo) {
    this.status = 'inactive'; // Ensure status is a string ('inactive')
  }

  next();
});

// Create or update the model using the new schema
const ReferredRecord = mongoose.model('ReferredRecord', referredRecordSchema);

// Export the model
module.exports = {
  ReferredRecord,
};
