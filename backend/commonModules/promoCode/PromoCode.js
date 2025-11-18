const mongoose = require("mongoose"); 
const crypto = require("crypto"); // For generating random unique strings

// Define discount types
const DiscountType = {
  PERCENTAGE: "percentage",
  FIXED_AMOUNT: "amount",
};

// Function to generate a unique promo code
const generatePromoCode = () => {
  const timestamp = Date.now().toString(36);  // Timestamp to ensure uniqueness
  const randomString = crypto.randomBytes(3).toString("hex"); // Random part for extra uniqueness
  return `PROMO-${timestamp}-${randomString}`; // Combine both parts
};

// Define the PromoCode schema
const promoCodeSchema = new mongoose.Schema(
  {
    promoCode: {
      type: String,
      unique: true, // Ensure the promo code is unique in the collection
      required: true,
      default: generatePromoCode, // Generate a unique promo code by default
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    discountType: {
      type: String,
      enum: Object.values(DiscountType),
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0, // Discount value must be non-negative
      validate: {
        validator: function (value) {
          // Validate that discount value is less than 100 if the discount type is 'percentage'
          if (this.discountType === DiscountType.PERCENTAGE && value >= 100) {
            return false;  // Invalid if percentage is 100 or more
          }
          return true;  // No restriction for 'fixed_amount'
        },
        message: 'If discount type is percentage, the discount value must be less than 100.',
      },
    },
    maxDiscountCap: {
      type: Number,
      default: 0, // No cap by default
      min: 0,
    },
    expiryDate: {
      type: Date,
      required: true,
    },
    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Assuming you have a User model for the company organizer
      required: true,
    },
    maxUsage: {
      type: Number,
      required: true,
      min: 1, // At least one usage
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0, // Track how many times the promo code has been used globally
    },
    maxCountPerUser: {
      type: Number,
default: 1,
      min: 1, // At least one usage per user
    },
    usersUsed: {
      type: Map,
      of: Object, // Each userId will be the key, and the value will be an object with `count`
      default: {}, // Default to an empty object
    },
    status: {
      type: String,
      enum: ["active", "canceled", "deleted"],
      default: "active", // Default status is "active"
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt
  }
);

// Middleware to update `updatedAt` field before saving
promoCodeSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Method to check if a promo code is still valid
promoCodeSchema.methods.isValid = function () {
  const now = new Date();
  return this.isActive && now < this.expiryDate && this.usedCount < this.maxUsage;
};

// Method to apply the promo code to a given amount (using discountValue for both percentage and fixed amount)
promoCodeSchema.methods.applyDiscount = function (amount, userId) {
  // Check if the user has already used the promo code within the allowed usage limit
  const userUsage = this.usersUsed.get(userId); // Retrieve the user's usage object by userId

  if (userUsage && userUsage.count >= this.maxCountPerUser) {
    return { error: "You have exceeded the maximum usage for this promo code." };
  }

  if (!this.isValid()) {
    return { error: "Promo code is invalid or expired." };
  }

  let discount = 0;

  if (this.discountType === DiscountType.PERCENTAGE) {
    // Apply percentage discount
    discount = (this.discountValue / 100) * amount;
    if (this.maxDiscountCap > 0 && discount > this.maxDiscountCap) {
      discount = this.maxDiscountCap; // Cap the discount if needed
    }
  } else if (this.discountType === DiscountType.FIXED_AMOUNT) {
    // Apply fixed amount discount
    discount = this.discountValue;
  }

  return {
    discount,
    finalAmount: amount - discount,
  };
};

// Method to increment the used count for the promo code and track user usage
promoCodeSchema.methods.incrementUsage = async function (userId) {
  if (this.usedCount < this.maxUsage) {
    // Increment the global usage count
    this.usedCount += 1;

    // Track user-specific usage count, where userId is the key, and the value is an object with the `count`
    const userUsage = this.usersUsed.get(userId); // Get the user's current usage info

    if (userUsage) {
      // If the user has already used the promo code, increment their usage count
      userUsage.count += 1;
    } else {
      // Otherwise, initialize their usage with the current count
      this.usersUsed.set(userId, { count: 1 });
    }

    await this.save();
    return true;
  }
  return false;
};

const PromoCode = mongoose.model("PromoCode", promoCodeSchema);

module.exports = {
  PromoCode,
  DiscountType,
};
