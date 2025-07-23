const mongoose = require("mongoose");
const moment = require("moment");
const shortid = require("shortid");
const sessionSchema = new mongoose.Schema(
  {
    basicInfo: {
      title: {
        type: String,
        required: true,
        trim: true,
        default: "",
      },
      description: {
        type: String,
        required: true,
        trim: true,
        default: "",
      },
      images: [
        {
          type: String,
          default: "",
        },
      ],

      specialization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Specialization",
        required: true,
      },
      trainingMode: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TrainingMode",
        required: true,
      },
      genderPreference: {
        type: String,
        enum: ["Male", "Female", "Other"],
        default: "Other",
      },
      maxDistance: {
        type: Number,
        default: 0,
      },
    },

    pricingAndDuration: {
      startDate: {
        type: Date,
        default: null,
      },
      endDate: {
        type: Date,
        default: null,
      },
      startTime: {
        type: String,
        default: null,
      },
      endTime: {
        type: String,
        default: null,
      },
      price: {
        type: Number,
        default: 0,
      },
      sessionTimeSlots: [
        //1-on-1 (for home service)
        {
          duration: {
            type: Number,
            default: null,
          },
          price: {
            type: Number,
            default: null,
          },
        },
      ],
    },
    sessionDetails: {
      location: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point", // Default type is 'Point'
        },
        coordinates: {
          type: [Number], // Array of [longitude, latitude]
          default: [0.0, 0.0], // Default coordinates
        },
        fullAddress: {
          type: String, // Full formatted address, e.g., "13th Street 47, NY 10011, USA"
          default: "", // You can make it optional if needed
        },
      },
      skillLevel: {
        type: String,
        enum: ["Beginner", "Intermediate", "Advanced"],
        default: "Beginner",
      },
      equipment: {
        type: String,
        default: "",
      },
      maxParticipants: {
        type: Number,
        default: 1,
      },
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    sessionShortId: {
      type: String,
      default: () => shortid.generate(), // Generate a short random booking number
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null, // This will be set when a conversation is created for the session
    },
    requestBeforeBooking: {
      type: Boolean,
      default: false, // If true, the user must request before booking
    },
  },
  {
    timestamps: true, // Automatically manage createdAt and updatedAt fields
  }
);

sessionSchema.methods.toJSON = function (sessionData) {
  const session = this;
  const sessionObject = sessionData ? sessionData : session.toObject();

  if (sessionObject.pricingAndDuration) {
    sessionObject.pricingAndDuration.currencySymbol = "$";
  }
  // Attach base URL to images only if image name does not start with http
  const baseUrl = `${process.env.S3_BASE_URL}/`;
  if (sessionObject.basicInfo && sessionObject.basicInfo.images.length > 0) {
    sessionObject.basicInfo.images = sessionObject.basicInfo.images.map(
      (image) => {
      if (typeof image === "object" && image !== null) {
        return image;
      }
      let url = image.startsWith("http") ? image : baseUrl + image;
      let name = image.startsWith("http")
        ? image.substring(image.lastIndexOf("/") + 1)
        : image;
      return { url, name };
      }
    );
  }
  if (
    sessionObject.creator &&
    sessionObject.creator.profileIcon &&
    !sessionObject.creator.profileIcon.startsWith("http")
  ) {
    sessionObject.creator.profileIcon =
      baseUrl + sessionObject.creator.profileIcon;
  }

  // Return date format in dd-mm-yyyy
  const formatDate = (date) => {
    return moment(date).format("DD-MM-YYYY");
  };

  if (sessionObject.pricingAndDuration) {
    sessionObject.pricingAndDuration.startDate = formatDate(
      sessionObject.pricingAndDuration.startDate
    );
    sessionObject.pricingAndDuration.endDate = formatDate(
      sessionObject.pricingAndDuration.endDate
    );
  }

  return sessionObject;
};

const Session = mongoose.model("Session", sessionSchema);

module.exports = Session;
