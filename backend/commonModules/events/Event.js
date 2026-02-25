const mongoose = require("mongoose");
const { RecurringEventSchema } = require("./RecurringEventSchema");
const { nanoid } = require("nanoid");
const { LocationSchema } = require("../../shared/locations/locationSchmea");

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
      venueLocation: {
        type: LocationSchema,
        default: {},
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
      partnerOrganization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organizations",
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
      ref: "User",
      required: true,
    },
    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

    recurringMeta: {  // only for recurring events
      isTemplate: {
        type: Boolean,
        default: false,
      },

      parentEvent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event",
        default: null,
      },

      occurrenceIndex: {
        type: Number,
        default: 1,
      }
    },

    preOrdersEnabled: {
      type: Boolean,
      default: false,
    },
    feedbackEnabled: {
      type: Boolean,
      default: false,
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

eventSchema.index(
  {
    "basicInfo.organization": 1,
    "recurringMeta.parentEvent": 1,
    "schedule.startDateTime": 1
  },
  { unique: true, sparse: true }
);

//for cron job to notify users
eventSchema.index({ "schedule.startDateTime": 1, status: 1 });



const Events = mongoose.model("Event", eventSchema);

module.exports = {
  Events,
}
