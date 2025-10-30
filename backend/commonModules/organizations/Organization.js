const mongoose = require("mongoose");
const { LocationSchema } = require("../../shared/locations/locationSchmea");
const { getFullImageUrl } = require("../../helperUtils/imageHelper");
const {
  OperatingHoursSchema,
  transformOperatingHoursToLocal,
} = require("../../shared/commonSchemas/operatingHours");
const { FEATURE_KEYS } = require("../../admin/features/Feature");
const Categories = require("../../admin/categories/Categories");

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
        website: {
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
      type: OperatingHoursSchema,
      default: {},
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
    location: {
      type: LocationSchema,
      required: false,
    },
    staff: [ // Staff members associated with the organization e.g staff, managers
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        featuresAccess: [
          {
            type: String,
            enum: FEATURE_KEYS,
            default: [],
          },
        ],
        _id: false,

      },
    ],

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

organizationSchema.methods.formatResponse = function (orgData) {
  const org = orgData ? orgData : this.toObject();

  delete org.__v;

  // Handle media transformation for aggregation structure
  if (org.basicInfo?.media?.logo) {
    const logoName = org.basicInfo.media.logo;
    org.basicInfo.media.logo = {
      name: logoName,
      url: getFullImageUrl(logoName)
    };
  }

  if (org.basicInfo?.media?.cover) {
    const coverName = org.basicInfo.media.cover;
    org.basicInfo.media.cover = {
      name: coverName,
      url: getFullImageUrl(coverName)
    };
  }

  // Handle mediaInfo structure if exists
  if (org.basicInfo?.mediaInfo?.logo?.name) {
    org.basicInfo.mediaInfo.logo.url = getFullImageUrl(org.basicInfo.mediaInfo.logo.name);
  }
  if (org.basicInfo?.mediaInfo?.cover?.name) {
    org.basicInfo.mediaInfo.cover.url = getFullImageUrl(org.basicInfo.mediaInfo.cover.name);
  }

  // also transform otherInfo.categories if they are populated
  if (org.otherInfo?.categories && Array.isArray(org.otherInfo.categories)) {
    org.otherInfo.categories = org.otherInfo.categories.map(cat => {
      if (cat && typeof cat === 'object' && cat._id) {
        // Create a temporary Categories instance to use its method
        const categoryInstance = new Categories(cat);
        return categoryInstance.formatResponse();
      }
      return cat;
    });
  }

  //format tags if populated
  if (org.otherInfo?.tags && Array.isArray(org.otherInfo.tags)) {
    org.otherInfo.tags = org.otherInfo.tags.map(tag => {
      if (tag && typeof tag === 'object' && tag._id) {
        return {
          id: tag._id,
          title: tag.title,
        };
      }
      return tag;
    });
  }

  return org;
};


//Add geospatial index
organizationSchema.index({ "location": '2dsphere' });
organizationSchema.index({ status: 1 });
organizationSchema.index({ "otherInfo.categories": 1 });
organizationSchema.index({ "otherInfo.tags": 1 });

const Organizations = mongoose.model("Organizations", organizationSchema);

module.exports = Organizations;
