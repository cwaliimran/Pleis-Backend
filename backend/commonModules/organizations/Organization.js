const mongoose = require("mongoose");
const { LocationSchema } = require("../../shared/locations/locationSchmea");
const {
  OperatingHoursSchema,
} = require("../../shared/commonSchemas/operatingHours");
const { FEATURE_KEYS } = require("../../admin/features/Feature");
const { nanoid } = require("nanoid");


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
      phoneNumber: {
        code: {
          // Country code for phone number
          type: String,
          default: "",
        },
        number: {
          // Phone number without country code
          type: String,
          default: "",
        },
        default: {},
      },
      website: {
        type: String,
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
      type: OperatingHoursSchema,
      default: {},
    },
    creator: { //companyOrganizer
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

    meta: {
      favoritesCount: {
        type: Number,
        default: 0,
      },
      viewsCount: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

//Add geospatial index
organizationSchema.index({ "location": '2dsphere' });
organizationSchema.index({ status: 1 });
organizationSchema.index({ "otherInfo.categories": 1 });
organizationSchema.index({ "otherInfo.tags": 1 });


const Organizations = mongoose.model("Organizations", organizationSchema);

module.exports = Organizations;
