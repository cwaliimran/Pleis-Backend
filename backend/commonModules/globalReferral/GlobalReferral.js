const mongoose = require("mongoose");

// Global Referral Program Schema (admin-controlled)
const globalReferralSchema = new mongoose.Schema({
  // Referrer reward for successful referral (fixed reward)
  referrerRewardAmount: { type: Number, required: true }, // Reward for the referrer (e.g., €40)

  // Referred user rewards
  referredUserRewardAmount: { type: Number, required: true }, // Reward for referred user based on their purchase (e.g., €4 for every €5 purchase)
  referredUserAddMoneyReward: { type: Number, required: true }, // Reward for referred user when they add money to their account (e.g., €15)
  referredUserCardReward: { type: Number, required: true }, // Reward for referred user when they order a physical card (e.g., €20)

  // Conditions for referred user to qualify
  minimumPurchases: { type: Number, required: true }, // Minimum number of purchases for referred user to qualify for reward
  purchaseThreshold: { type: Number, required: true }, // Minimum amount for each purchase (e.g., €5)
  
  // Program settings
  expiryDate: { type: Date, required: true }, // Expiry date of the referral program
  status: {
    type: String,
    enum: ["active", "inactive", "ended"], // Whether the program is active, inactive, or ended
    default: "active", // Default status is "active"
  },
  createdAt: { type: Date, default: Date.now }, // When the program was created
  updatedAt: { type: Date, default: Date.now }, // When the program was last updated
});

// Admin can update or manage the referral program settings
globalReferralSchema.methods.updateProgram = async function (newData) {
  // Update the global referral conditions
  this.referrerRewardAmount = newData.referrerRewardAmount || this.referrerRewardAmount;
  this.referredUserRewardAmount = newData.referredUserRewardAmount || this.referredUserRewardAmount;
  this.referredUserAddMoneyReward = newData.referredUserAddMoneyReward || this.referredUserAddMoneyReward;
  this.referredUserCardReward = newData.referredUserCardReward || this.referredUserCardReward;
  this.minimumPurchases = newData.minimumPurchases || this.minimumPurchases;
  this.purchaseThreshold = newData.purchaseThreshold || this.purchaseThreshold;
  this.expiryDate = newData.expiryDate || this.expiryDate;
  this.status = newData.status || this.status;

  this.updatedAt = Date.now(); // Update timestamp
  await this.save(); // Save the updated program conditions
  return this; // Return the updated conditions
};

// Method to check if referred user meets the conditions for rewards
globalReferralSchema.methods.checkConditions = function (purchasesMade, totalAmountSpent, addMoney, orderCard) {
  // Check if the referred user has met the conditions for the "Spend €5 on 3 purchases" reward
  if (purchasesMade >= this.minimumPurchases && totalAmountSpent >= this.purchaseThreshold * this.minimumPurchases) {
    return {
      rewardType: "spendPurchasesReward",
      rewardAmount: this.referredUserRewardAmount,
    };
  }

  // Check if the referred user has added money to their account
  if (addMoney) {
    return {
      rewardType: "addMoneyReward",
      rewardAmount: this.referredUserAddMoneyReward,
    };
  }

  // Check if the referred user has ordered a physical card
  if (orderCard) {
    return {
      rewardType: "cardReward",
      rewardAmount: this.referredUserCardReward,
    };
  }

  return { error: "Conditions not met for any rewards." };
};

const GlobalReferral = mongoose.model("GlobalReferral", globalReferralSchema);

module.exports = {
  GlobalReferral,
};
