const mongoose = require("mongoose");
const { LocationSchema } = require("../../shared/locations/locationSchmea");
const { getFullImageUrl } = require("../../helperUtils/imageHelper");

const organizationSchema = new mongoose.Schema(
  {
    basicInfo: {
      media: {
        logo: {
          type: String,
          default: "",
        },
        cover: {
          type: String,
          default: "",
        },
      },
      name: {
        type: String,
        trim: true,
        required: true,
        default: "",
      },
      socialLinks: {
        youtube: {
          type: String,
          default: "",
        },
        facebook: {
          type: String,
          default: "",
        },
        instagram: {
          type: String,
          default: "",
        },
        linkedin: {
          type: String,
          default: "",
        },
      },
    },

    otherInfo: {
      description: {
        type: String,
        trim: true,
        default: "",
      },
      minAge: {
        type: Number,
        default: 0,
      },
      tags: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Tags",
          default: [],
        },
      ],
      categories: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Categories",
          default: [],
        },
      ],
      galleryMedia: [
        {
          type: String,
          default: "",
        },
      ],
    },
    operatingHours: {
      monday: {
        from: { type: String, default: "" },
        to: { type: String, default: "" },
        break: {
          from: { type: String, default: "" },
          to: { type: String, default: "" },
        },
        off: { type: Boolean, default: false },
      },
      tuesday: {
        from: { type: String, default: "" },
        to: { type: String, default: "" },
        break: {
          from: { type: String, default: "" },
          to: { type: String, default: "" },
        },
        off: { type: Boolean, default: false },
      },
      wednesday: {
        from: { type: String, default: "" },
        to: { type: String, default: "" },
        break: {
          from: { type: String, default: "" },
          to: { type: String, default: "" },
        },
        off: { type: Boolean, default: false },
      },
      thursday: {
        from: { type: String, default: "" },
        to: { type: String, default: "" },
        break: {
          from: { type: String, default: "" },
          to: { type: String, default: "" },
        },
        off: { type: Boolean, default: false },
      },
      friday: {
        from: { type: String, default: "" },
        to: { type: String, default: "" },
        break: {
          from: { type: String, default: "" },
          to: { type: String, default: "" },
        },
        off: { type: Boolean, default: false },
      },
      saturday: {
        from: { type: String, default: "" },
        to: { type: String, default: "" },
        break: {
          from: { type: String, default: "" },
          to: { type: String, default: "" },
        },
        off: { type: Boolean, default: false },
      },
      sunday: {
        from: { type: String, default: "" },
        to: { type: String, default: "" },
        break: {
          from: { type: String, default: "" },
          to: { type: String, default: "" },
        },
        off: { type: Boolean, default: false },
      },
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "blocked", "deleted"],
      default: "active",
    },
    venue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venues",
      default: null,
    },
    location: {
      type: LocationSchema,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: transformDoc },
    toObject: { virtuals: true, transform: transformDoc },
  }
);

/**
 * Adds mediaInfo as a virtual inside basicInfo.
 * This ensures the output is: basicInfo: { media: ..., mediaInfo: ... }
 */
organizationSchema.virtual("basicInfo.mediaInfo").get(function () {
  const media = this.basicInfo?.media || {};
  return {
    logo: {
      name: media.logo || "",
      url: getFullImageUrl(media.logo),
    },
    cover: {
      name: media.cover || "",
      url: getFullImageUrl(media.cover),
    },
  };
});

// Virtual for galleryMedia with full URLs
organizationSchema.virtual("otherInfo.galleryMediaInfo").get(function () {
  const gallery = this.otherInfo?.galleryMedia || [];
  return gallery.map((img) => ({
    name: img || "",
    url: getFullImageUrl(img),
  }));
});

// Custom transformation — applies automatically to .toJSON() and .toObject()
function transformDoc(doc, ret) {
  // Remove raw image strings if you want to hide them
  if (ret.basicInfo && ret.basicInfo.media) {
    delete ret.basicInfo.media;
  }
  if (ret.otherInfo && ret.otherInfo.galleryMedia) {
    delete ret.otherInfo.galleryMedia;
  }
  delete ret.id;
  return ret;
}


const Organizations = mongoose.model("Organizations", organizationSchema);

module.exports = Organizations;
