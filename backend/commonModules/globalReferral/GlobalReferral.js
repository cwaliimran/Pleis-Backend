const mongoose = require("mongoose");
const { nanoid } = require("nanoid");

// Global Referral Program Schema (admin-controlled)
const globalReferralSchema = new mongoose.Schema({
  // Unique publicId for the referral program (generated with nanoid)
  publicId: {
    type: String,
    unique: true,
    index: true,
    default: () => nanoid(),
  },

  // Unique publicCreatorId for the creator (generated with nanoid)
  publicCreatorId: {
    type: String,
    unique: true,
    index: true,
    default: () => nanoid(),
  },

  // Reward for the referred user (single amount for fulfilling the conditions)
  rewardAmount: { type: Number, required: true },

  // Conditions for referred user to qualify
  minimumPurchases: { type: Number, required: true }, // Minimum number of purchases for referred user to qualify for reward
  purchaseThresholdAmount: { type: Number, required: true }, // Minimum amount for each purchase

  creator: {
    type: mongoose.Schema.Types.ObjectId, // Use ObjectId to reference the User model
    ref: "User", // Reference the User model
    required: true,
  },

  // Program settings
  expiryDate: { type: Date, required: true }, // Expiry date of the referral program
  status: {
    type: String,
    enum: ["active", "inactive", "deleted"], // Whether the program is active, inactive, or deleted
    default: "active", // Default status is "active"
  },
  type: {
    type: String,
    enum: ["global", "company", "organizer", "user"], // Type of referral program
    required: true,
  },
  createdAt: { type: Date, default: Date.now }, // When the program was created
  updatedAt: { type: Date, default: Date.now }, // When the program was last updated
});

// Pre-save hook to ensure publicId and publicCreatorId are generated before saving
globalReferralSchema.pre('save', function (next) {
  // Check if publicId and publicCreatorId are missing
  if (!this.publicId) {
    this.publicId = nanoid();
  }
  if (!this.publicCreatorId) {
    this.publicCreatorId = nanoid();
  }

  console.log("Document before saving:", this); // Log to check the fields

  // Proceed with saving
  next();
});

// Admin can update or manage the referral program settings
globalReferralSchema.methods.updateProgram = async function (newData) {
  // If the referral type is global and we're trying to activate it, check if one already exists
  if (newData.status === "active") {
    const existingGlobalReferral = await mongoose.models.GlobalReferral.findOne({ 
      type: "global", 
      status: "active" 
    });

    if (existingGlobalReferral) {
      throw new Error("An active global referral program already exists.");
    }
  }

  // Update fields based on newData
  this.rewardAmount = newData.rewardAmount || this.rewardAmount;
  this.minimumPurchases = newData.minimumPurchases || this.minimumPurchases;
  this.purchaseThreshold = newData.purchaseThreshold || this.purchaseThreshold;
  this.expiryDate = newData.expiryDate || this.expiryDate;
  this.status = newData.status || this.status;
  this.type = newData.type || this.type;

  this.updatedAt = Date.now(); // Update timestamp
  await this.save(); // Save the updated program conditions
  return this; // Return the updated conditions
};

// Method to check if referred user meets the conditions for rewards
globalReferralSchema.methods.checkConditions = function (purchasesMade, totalAmountSpent) {
  if (purchasesMade >= this.minimumPurchases && totalAmountSpent >= this.purchaseThresholdAmount * this.minimumPurchases) {
    return {
      rewardAmount: this.rewardAmount,
    };
  }

  return { error: "Conditions not met for any rewards." };
};

const GlobalReferral = mongoose.model("GlobalReferral", globalReferralSchema);

module.exports = {
  GlobalReferral,
};
