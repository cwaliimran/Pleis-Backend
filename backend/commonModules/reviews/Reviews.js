const mongoose = require("mongoose");

const reviewsSchema = new mongoose.Schema(
  {
    rating: {
      type: Number,
      trim: true,
      required: true,
      max: 5,
      min: 0,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
      required: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Events",
      required: true,
    },
    user: { 
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    comment: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

reviewsSchema.index({ organization: 1, status: 1 });
reviewsSchema.index({ organization: 1, rating: -1 });
reviewsSchema.index({ createdAt: -1 }); 


const Reviews = mongoose.model("Reviews", reviewsSchema);

module.exports = Reviews;