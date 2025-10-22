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
      // Remove unique from schema, handle in pre-save
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

// Custom validation for unique title if status is not 'deleted'
venuetypesSchema.pre("save", async function (next) {
  if (this.status !== "deleted") {
    const existing = await mongoose.models.VenueTypes.findOne({
      title: this.title,
      status: { $ne: "deleted" },
      _id: { $ne: this._id }
    });
    if (existing) {
      return next(new Error("Title must be unique for active/inactive venue types."));
    }
  }
  next();
});

// Virtual field `icon` (computed image + full URL)
venuetypesSchema.virtual("imageInfo").get(function () {
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

const VenueTypesModel = mongoose.model("VenueTypes", venuetypesSchema);

module.exports = VenueTypesModel;
