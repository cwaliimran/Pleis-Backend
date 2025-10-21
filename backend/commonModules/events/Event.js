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

const Events = mongoose.model("Event", eventSchema);

module.exports = {
  Events,
}
