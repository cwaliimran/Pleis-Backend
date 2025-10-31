const mongoose = require("mongoose");
const { getFullImageUrl } = require("../../helperUtils/imageHelper");

const categoriesSchema = new mongoose.Schema(
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
      unique: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);


const Categories = mongoose.model("Categories", categoriesSchema);

module.exports = Categories;
