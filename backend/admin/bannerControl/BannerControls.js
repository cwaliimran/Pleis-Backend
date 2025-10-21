const mongoose = require("mongoose");
const { getFullImageUrl } = require("../../helperUtils/imageHelper");

const bannerControlsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
    },
    image: {
      type: String,
      default: "",
    },

    type: {
      type: String,
      enum: ["Organizer", "Event", "LoyaltyProgram"],
      default: "Event",
    },

    // internal field that holds the actual model name used for refPath
    // LoyaltyProgram and Organizer should reference the User model (difference is only for UI)
    objectModel: {
      type: String,
      default: function () {
        return this.type === "LoyaltyProgram" || this.type === "Organizer"
          ? "User"
          : this.type;
      },
      select: false, // hide by default in queries
    },

    // object refs the model name stored in `objectModel`
    object: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "objectModel",
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
bannerControlsSchema.virtual("imageInfo").get(function () {
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

const BannerControls = mongoose.model("BannerControls", bannerControlsSchema);

module.exports = BannerControls;
