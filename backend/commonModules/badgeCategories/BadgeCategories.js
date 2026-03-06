const mongoose = require("mongoose");

const CATEGORY_CONDITION_MAP = {
  referral: ["count"],
  spending: ["amount"],
  singlePurchase: ["amount"],
  topSpender: ["rank"],
  repeatVisit: ["count"],
  venueExplorer: ["count"],
  streak: ["streakDays"],
};

const BadgeCategoriesSchema = new mongoose.Schema(
{
  title: {
    type: String,
    required: true,
    trim: true,
  },

  description: {
    type: String,
    trim: true,
    default: "",
  },

  icon: {
    type: String,
    default: null,
  },

  category: {
    type: String,
    enum: Object.keys(CATEGORY_CONDITION_MAP),
    required: true,
    index: true
  },

  condition: {
    type: {
      type: String,
      enum: ["count", "amount", "rank", "streakDays"],
      required: true,
    },

    value: {
      type: Number,
      required: true,
      min: 1,
    },
  },

  points: {
    type: Number,
    required: true,
    min: 0,
  },

  status: {
    type: String,
    enum: ["active", "inactive", "deleted"],
    default: "active",
    index: true
  },
},
{
  timestamps: true,
}
);

/* =====================================================
   🔎 BADGE EVALUATION INDEX (IMPORTANT)
   Speeds up badge lookup during evaluation
===================================================== */

BadgeCategoriesSchema.index({
  category: 1,
  "condition.type": 1,
  "condition.value": 1,
  status: 1
});

/* =====================================================
   VALIDATION
===================================================== */

BadgeCategoriesSchema.pre("validate", function (next) {

  const allowedConditions = CATEGORY_CONDITION_MAP[this.category];

  if (!allowedConditions) {
    return next(new Error(`Invalid badge category "${this.category}"`));
  }

  if (!allowedConditions.includes(this.condition.type)) {
    return next(
      new Error(
        `Invalid condition type "${this.condition.type}" for category "${this.category}"`
      )
    );
  }

  next();
});

module.exports = mongoose.model("BadgeCategories", BadgeCategoriesSchema);