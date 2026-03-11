const mongoose = require("mongoose");

// Discount Types
const DiscountType = {
  PERCENTAGE: "percentage",
  FIXED_AMOUNT: "amount",
};

const promoCodeSchema = new mongoose.Schema(
  {
    promoCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    discountType: {
      type: String,
      enum: Object.values(DiscountType),
      required: true,
    },

    discountValue: {
      type: Number,
      required: true,
      min: 0.01,
      validate: {
        validator: function (value) {
          if (this.discountType === DiscountType.PERCENTAGE) {
            return value > 0 && value < 100;
          }
          return value >= 0;
        },
        message:
          "Percentage discount must be greater than 0 and less than 100.",
      },
    },

    maxDiscountCap: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: function (value) {
          if (this.discountType === DiscountType.PERCENTAGE) {
            return value >= 0;
          }
          return true;
        },
      },
    },

    expiryDate: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return value > new Date();
        },
        message: "Expiry date must be in the future.",
      },
    },

    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    maxUsage: {
      type: Number,
      required: true,
      min: 1,
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxCountPerUser: {
      type: Number,
      default: 1,
      min: 1,
    },

    usersUsed: {
      type: Map,
      of: {
        count: {
          type: Number,
          min: 1,
          default: 1,
        },
      },
      default: {},
    },

    status: {
      type: String,
      enum: ["active", "inactive", "canceled", "deleted"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);


// ------------------------------------------------
// INDEXES
// ------------------------------------------------

// Ensure unique promo per organizer
promoCodeSchema.index(
  { promoCode: 1, companyOrganizer: 1 },
  { unique: true }
);


// ------------------------------------------------
// HELPER METHODS
// ------------------------------------------------

promoCodeSchema.methods.isExpired = function () {
  return new Date() > this.expiryDate;
};

promoCodeSchema.methods.isUsageAvailable = function () {
  return this.usedCount < this.maxUsage;
};

promoCodeSchema.methods.canUserUse = function (userId) {
  const userKey = userId.toString();
  const userUsage = this.usersUsed.get(userKey);

  if (userUsage && userUsage.count >= this.maxCountPerUser) {
    return false;
  }

  return true;
};

promoCodeSchema.methods.isValid = function () {
  if (this.status !== "active") return false;
  if (this.isExpired()) return false;
  if (!this.isUsageAvailable()) return false;

  return true;
};


// ------------------------------------------------
// DISCOUNT CALCULATION
// ------------------------------------------------

promoCodeSchema.methods.applyDiscount = function (amount, userId) {
  if (!this.isValid()) {
    return { error: "Promo code is invalid or expired." };
  }

  if (!this.canUserUse(userId)) {
    return { error: "You have exceeded the maximum usage for this promo code." };
  }

  let discount = 0;

  if (this.discountType === DiscountType.PERCENTAGE) {
    discount = (this.discountValue / 100) * amount;

    if (this.maxDiscountCap > 0 && discount > this.maxDiscountCap) {
      discount = this.maxDiscountCap;
    }
  }

  if (this.discountType === DiscountType.FIXED_AMOUNT) {
    discount = this.discountValue;
  }

  const finalAmount = Math.max(amount - discount, 0);

  return {
    discount,
    finalAmount,
  };
};


// ------------------------------------------------
// USAGE INCREMENT
// ------------------------------------------------

promoCodeSchema.methods.incrementUsage = async function (userId) {
  const userKey = userId.toString();

  if (!this.isUsageAvailable()) {
    return null;
  }

  this.usedCount += 1;

  const userUsage = this.usersUsed.get(userKey);

  if (userUsage) {
    this.usersUsed.set(userKey, {
      count: userUsage.count + 1,
    });
  } else {
    this.usersUsed.set(userKey, {
      count: 1,
    });
  }

  await this.save();

  return this.usersUsed.get(userKey);
};


// ------------------------------------------------
// MODEL
// ------------------------------------------------

const PromoCode = mongoose.model("PromoCode", promoCodeSchema);

module.exports = {
  PromoCode,
  DiscountType,
};