const mongoose = require("mongoose");

// Reference to the Users model for createID
const globalRewardCategoriesSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      default: "",
    },
    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    createID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, 
    },
  },
  {
    timestamps: true,
  }
);

// Create or use the existing GlobalRewardCategories model
const GlobalRewardCategories =
  mongoose.models.GlobalRewardCategories ||
  mongoose.model("GlobalRewardCategories", globalRewardCategoriesSchema);

module.exports = GlobalRewardCategories;
