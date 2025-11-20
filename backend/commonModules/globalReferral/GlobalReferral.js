const mongoose = require("mongoose");
const { nanoid } = require("nanoid");

// Global Referral Program Schema (admin-controlled)
const globalReferralSchema = new mongoose.Schema({
  publicId: {
    type: String,
    unique: true,
    index: true,
    default: () => nanoid(),
  },

  publicCreatorId: {
    type: String,
    unique: true,
    index: true,
    default: () => nanoid(),
  },

  rewardAmount: { type: Number, required: true },

  minimumPurchases: { type: Number, required: true },
  purchaseThresholdAmount: { type: Number, required: true },

  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Reference to the User model
    required: true,
  },

  expiryDate: { type: Date, required: true },

  status: {
    type: String,
    enum: ["active", "inactive", "deleted"],
    default: "active",
  },

  type: {
    type: String,
    enum: ["global", "company", "organizer", "user"],
    required: true,
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Pre-save hook to check for an existing active global referral program
globalReferralSchema.pre('save', async function (next) {
  if (this.status === "active" && this.type === "global") {
    // Check if there's already an active global referral program
    const existingGlobalReferral = await mongoose.models.GlobalReferral.findOne({
      type: "global",
      status: "active",
    });

    if (existingGlobalReferral) {
      const error = new Error("An active global referral program already exists.");
      next(error);  // Stop saving the document
      return;  // Ensure the next() call doesn't run
    }
  }
  next();  // Proceed with saving the document
});

// Pre-update hook to prevent updating the status to 'active' if another global referral is already active
globalReferralSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate();

  // Check if we're trying to set this document's status to 'active' and the type is 'global'
  if (update.status === "active" && update.type === "global") {
    // Check if there's already an active global referral program
    const existingGlobalReferral = await mongoose.models.GlobalReferral.findOne({
      type: "global",
      status: "active",
    });

    if (existingGlobalReferral) {
      const error = new Error("An active global referral program already exists.");
      next(error);  // Stop updating the document
      return;  // Ensure the next() call doesn't run
    }
  }
  next();  // Proceed with the update operation
});

// Model for the global referral schema
const GlobalReferral = mongoose.model("GlobalReferral", globalReferralSchema);

module.exports = {
  GlobalReferral,
};
