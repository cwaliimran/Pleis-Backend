const mongoose = require("mongoose");

const userBadgeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    badgeCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BadgeCategories",
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);
userBadgeSchema.index(
  { user: 1, badgeCategory: 1 },
  { unique: true }
);


module.exports = mongoose.model("UserBadges", userBadgeSchema);
