const mongoose = require("mongoose");

const RecentlyViewedItemTargetTypes = ["menu", "event", "organization"];

const recentlyViewedItemSchema = new mongoose.Schema(
     {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      index: true,
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "targetType",
      index: true,
    },
    targetType: {
      type: String,
      enum: ["event", "organization"],
      required: true,
      index: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate recentlyViewedItems by the same user
recentlyViewedItemSchema.index({ user: 1, targetId: 1, targetType: 1 }, { unique: true });

const RecentlyViewedItems = mongoose.model("RecentlyViewedItems", recentlyViewedItemSchema);
module.exports = { RecentlyViewedItems, RecentlyViewedItemTargetTypes };
