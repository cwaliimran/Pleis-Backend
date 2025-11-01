const mongoose = require("mongoose");
const { LocationSchema } = require("../../shared/locations/locationSchmea");
const { getFullImageUrl } = require("../../helperUtils/imageHelper");
const {
  OperatingHoursSchema,
  transformOperatingHoursToLocal,
} = require("../../shared/commonSchemas/operatingHours");
const { FEATURE_KEYS } = require("../../admin/features/Feature");
const Categories = require("../../admin/categories/Categories");
const { nanoid } = require("nanoid");
const { formatCategories } = require("../../admin/categories/formatters/categoryFormatter");


const organizationSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      unique: true,
      index: true,
      default: () => nanoid(),
    },
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
  }
);

organizationSchema.methods.formatResponse = function (orgData) {
  const org = orgData ? orgData : this.toObject();

  delete org.__v;

  // Handle media transformation for aggregation structure
  if (org.basicInfo?.media?.logo) {
    const logoName = org.basicInfo.media.logo;
    org.basicInfo.media.logo = getFullImageUrl(logoName);
  }

  if (org.basicInfo?.media?.cover) {
    const coverName = org.basicInfo.media.cover;
    org.basicInfo.media.cover = getFullImageUrl(coverName)
  }

  org.basicInfo.media.logo.url = getFullImageUrl(org.basicInfo?.media?.logo?.name);
  org.basicInfo.media.cover.url = getFullImageUrl(org.basicInfo?.media?.cover?.name);
  if (org.otherInfo?.galleryMedia && Array.isArray(org.otherInfo.galleryMedia)) {
    org.otherInfo.galleryMedia = org.otherInfo.galleryMedia.map((mediaName) => (getFullImageUrl(mediaName)));
  }

  // also transform otherInfo.categories if they are populated and not just ObjectIds
  if (org.otherInfo?.categories && Array.isArray(org.otherInfo.categories)) {
    // Check if at least one element is a populated object (not just ObjectId or string)
    const hasPopulated = org.otherInfo.categories.some(
      cat =>
        cat &&
        typeof cat === 'object' &&
        cat._id &&
        // Exclude plain ObjectId objects (which have only _id and no other keys)
        (Object.keys(cat).length > 1 || (cat.title || cat.name))
    );
    if (hasPopulated) {
      org.otherInfo.categories = formatCategories(org.otherInfo.categories);
    }
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
