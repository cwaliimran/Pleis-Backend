const mongoose = require("mongoose");
const { RecurringEventSchema } = require("./RecurringEventSchema");
const { nanoid } = require("nanoid");

const eventSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      unique: true,
      index: true,
      default: () => nanoid(),
    },
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
        enum: ["oneTime"],
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
    
    meta: {
      revenue: {
        type: Number,
        default: 0,
      },
      favoritesCount: {
        type: Number,
        default: 0,
      },
      viewsCount: {
        type: Number,
        default: 0,
      },
      attendeesCount: {
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
  }
);

//Add indexes
eventSchema.index({ "basicInfo.venueLocation": '2dsphere' });
eventSchema.index({ "basicInfo.organization": 1, status: 1 });
eventSchema.index({ "basicInfo.venue": 1 });
eventSchema.index({ "basicInfo.tags": 1 });
eventSchema.index({ "basicInfo.categories": 1 });


const Events = mongoose.model("Event", eventSchema);

module.exports = {
  Events,
}
