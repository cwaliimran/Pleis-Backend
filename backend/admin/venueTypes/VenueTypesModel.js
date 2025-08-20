const mongoose = require("mongoose");
const { getFullImageUrl } = require("../../helperUtils/imageHelper");

const venuetypesSchema = new mongoose.Schema(
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
    pinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: transformDoc },
    toObject: { virtuals: true, transform: transformDoc },
  }
);

// ✅ Virtual field `icon` (computed image + full URL)
venuetypesSchema.virtual("imageInfo").get(function () {
  const image = this.image || "noimage.png";
  const url = getFullImageUrl(image);
  return { name: image, url };
});

// ✅ Custom transformation — applies automatically to .toJSON() and .toObject()
function transformDoc(doc, ret) {
  delete ret.image; // remove original image string
  delete ret.id; // remove original image string
  return ret;
}

const VenueTypesModel = mongoose.model("VenueTypes", venuetypesSchema);

module.exports = VenueTypesModel;
