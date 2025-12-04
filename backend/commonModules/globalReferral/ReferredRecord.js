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

    userReward: {
      type: Number,
      default: 0,  // Default to 0 if not provided
    },

    referrerReward: {
      type: Number,
      default: 0,  // Default to 0 if not provided
    },
  },
  { timestamps: true }  // Automatically add createdAt and updatedAt
);

// Pre-save hook to set purchased = true if purchases >= 3
referredRecordSchema.pre('save', function (next) {
  if (this.purchases >= 3 && !this.purchased) {
    this.purchased = true;  // Set purchased to true if purchases >= 3
  }
  next();
});

// Ensure unique IP constraint (no duplicate IP addresses allowed)
referredRecordSchema.index({ userIp: 1 }, { unique: true });

// Create or update the model using the new schema
const ReferredRecord = mongoose.model('ReferredRecord', referredRecordSchema);

// Export the model
module.exports = {
  ReferredRecord,
};
