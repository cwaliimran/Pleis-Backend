const mongoose = require("mongoose");

const userGlobalBadgesSchema = new mongoose.Schema(
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
  },

  timesEarned: {
    type: Number,
    default: 1
  },

  lastEarnedAt: {
    type: Date,
    default: Date.now
  }
},
{
  timestamps: true
}
);

userGlobalBadgesSchema.index({ user: 1, badgeCategory: 1 });

module.exports = mongoose.model("UserGlobalBadges", userGlobalBadgesSchema);