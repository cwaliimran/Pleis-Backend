const mongoose = require("mongoose");
const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

const menuItemsSchema = new mongoose.Schema(
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
    description: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      default: "",
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItemCategories",
      required: true,
    },

    basePrice: {
      type: Number,
      default: 0,
    },
    discountPrice: {
      type: Number,
      default: 0,
    },
    taxPercent: {
      type: Number,
      default: 0,
    },

    menu: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Menus",
      required: true,
    },

    startTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },

    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: transformDoc },
    toObject: { virtuals: true, transform: transformDoc },
  }
);


// Virtual field `icon` (computed image + full URL)
menuItemsSchema.virtual("imageInfo").get(function () {
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
 * Universal formatter — works for both Mongoose docs & plain JS objects.
 * Detects type automatically.
 */
menuItemsSchema.statics.formatResponse = function (input) {
  if (!input) return null;

  // Detect if it's a Mongoose document
  const isDoc = typeof input.toObject === "function";
  const item = isDoc ? input.toObject() : { ...input };

  // Format image
  const imageName = item.image || "noimage.png";
  item.imageInfo = {
    name: imageName,
    url: getFullImageUrl(imageName),
  };

  delete item.__v;
  delete item.image;
  return item;
};

// (Optional alias for readability — can call via instance too)
menuItemsSchema.methods.formatResponse = function () {
  return this.constructor.formatResponse(this);
};


const MenuItems = mongoose.model("MenuItems", menuItemsSchema);

module.exports = MenuItems;
