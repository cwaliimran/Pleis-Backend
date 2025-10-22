const mongoose = require("mongoose");
const { getFullImageUrl } = require("../../helperUtils/imageHelper");
const { RecurringEventSchema } = require("./RecurringEventSchema");

const eventSchema = new mongoose.Schema(
  {
    basicInfo: {
      media: {
        type: {
          type: String,
          enum: ["image", "video"],
          default: "image",
        },
        name: {
          type: String,
          default: "",
        },
      },
      title: {
        type: String,
        trim: true,
        required: true,
        default: "",
      },
      description: {
        type: String,
        trim: true,
        default: "",
      },
      organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organizations",
        required: true,
      },
      venue: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Venues",
        required: true,
      },
      venueLocation: { //only used for nearby events without populating venue
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point',
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
          required: true,
          validate: {
            validator: function (arr) {
              return Array.isArray(arr) && arr.length === 2;
            },
            message: 'venueLocation.coordinates must be [longitude, latitude]',
          },
        },
      },

      categories: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Categories",
          default: [],
        },
      ],
      tags: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Tags",
          default: [],
        },
      ],
      partnerOrganizer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users",
        default: null,
      }
    },

    schedule: {
      type: {
        type: String,
        enum: ["oneTime", "slots"],
        default: "oneTime",
      },
      startDateTime: {
        type: Date,
        required: true,
      },
      endDateTime: {
        type: Date,
      },
      recurringDetails: {
        type: RecurringEventSchema,
        default: null,
      },
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "completed", "deleted"],
      default: "active",
    },
    // New addition
    meta: {
      revenue: {
        type: Number,
        default: 0,
      },
      views: {
        type: Number,
        default: 0,
      },
      region: {
        type: String,
        trim: true,
        default: "",
      },
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
eventSchema.virtual("basicInfo.mediaInfo").get(function () {
  const media = this.basicInfo?.media || {};
  return {
    name: media.name || "",
    type: media.type || "image",
    url: getFullImageUrl(media.name),
  };
});

// Custom transformation — applies automatically to .toJSON() and .toObject()
function transformDoc(doc, ret) {
  // Remove raw image strings if you want to hide them
  if (ret.basicInfo && ret.basicInfo.media) {
    delete ret.basicInfo.media;
  }
  delete ret.id;
  return ret;
}

// provide a named instance method so it's not invoked automatically
eventSchema.method("toPublicJSON", function (eventData) {
  let eventObject;

  if (eventData && typeof eventData === "object" && !Array.isArray(eventData)) {
    // Case 1: explicitly provided plain object
    eventObject = { ...eventData };
  } else if (typeof this.toObject === "function") {
    // Case 2: called on a mongoose doc
    eventObject = this.toObject({ virtuals: true });
  } else {
    // Case 3: fallback if it's already a plain object
    eventObject = { ...this };
  }

  // Ensure basicInfo exists
  if (!eventObject.basicInfo) eventObject.basicInfo = {};

  // Ensure mediaInfo virtual is present when a plain object was provided
  const media = eventObject.basicInfo.media || {};
  eventObject.basicInfo.mediaInfo = {
    name: media.name || "",
    type: media.type || "image",
    url: getFullImageUrl(media.name),
  };

  // Apply the same schema-level transform used by toObject/toJSON
  // transformDoc signature: function(doc, ret) { ... }
  // We don't have the original doc here when a plain object was passed, so pass null
  transformDoc(null, eventObject);

  return eventObject;
});

//Add geospatial index
eventSchema.index({ "basicInfo.venueLocation": '2dsphere' });

const Events = mongoose.model("Event", eventSchema);

module.exports = {
  Events,
}
