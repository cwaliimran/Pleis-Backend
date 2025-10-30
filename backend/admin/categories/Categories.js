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
    toJSON: { virtuals: true, transform: transformDoc },
    toObject: { virtuals: true, transform: transformDoc },
  }
);

// Virtual field `icon` (computed image + full URL)
categoriesSchema.virtual("imageInfo").get(function () {
  const image = this.image || "noimage.png";
  const url = getFullImageUrl(image);
  return { name: image, url };
});

// Custom transformation — applies automatically to .toJSON() and .toObject()
function transformDoc(doc, ret) {
  delete ret.image; // remove original image string
  delete ret.id; // remove original image string
  return ret;
}

/**
 * Format category response (works for both Mongoose doc and plain object)
 */
categoriesSchema.methods.formatResponse = function () {
  const cat = this.toObject ? this.toObject() : this;

  const image = cat.image || "noimage.png";
  const formatted = {
    _id: cat._id,
    title: cat.title || "",
    imageInfo: {
      name: image,
      url: getFullImageUrl(image),
    },
  };

  return formatted;
};

const Categories = mongoose.model("Categories", categoriesSchema);

module.exports = Categories;
