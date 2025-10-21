const mongoose = require("mongoose");
const { getFullImageUrl } = require("../../helperUtils/imageHelper");

const highlightSchema = new mongoose.Schema(
  {
      media: {
        type: {
          type: String,
          enum: ["video"],
          default: "video",
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
      type: {
        type: String,
        enum: ["event", "organization"],
        default: "event",
      },
      object:{
        type: mongoose.Schema.Types.ObjectId,
        refPath: "type",
        required: true,
      },

    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    // New addition
    meta: {
      views: {
        type: Number,
        default: 0,
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
 * This ensures the output is: mediaInfo: ...
 */
highlightSchema.virtual("mediaInfo").get(function () {
  const media = this.media || {};
  return {
    name: media.name || "",
    type: media.type || "video", // Ensure 'video' as default
    url: getFullImageUrl(media.name),
  };
});

// Custom transformation — applies automatically to .toCustomJSON() and .toObject()
function transformDoc(doc, ret) {
  // Remove raw image strings if you want to hide them
  if (ret.media) {
    delete ret.media;
  }
  delete ret.id;
  return ret;
}


highlightSchema.methods.toCustomJSON = function (highlightData) {
  const highlight = this;
  const highlightObject = highlightData
    ? highlightData
    : highlight.toObject({ virtuals: true });

  // Default media info
  let mediaName = "";
  let mediaType = "video";
  let mediaUrl = "";

  // Top-level highlight media
  if (highlight.media) {
    mediaName = highlight.media.name || "";
    mediaType = highlight.media.type || "video";
    mediaUrl = getFullImageUrl(mediaName);
  }

  // Always attach root-level mediaInfo
  highlightObject.mediaInfo = {
    name: mediaName,
    type: mediaType,
    url: mediaUrl,
  };

  // Populated object media
  const object = highlightObject.object;
  if (object?.basicInfo?.media) {
    if (highlightObject.type === "organization") {
      // Organization: logo and cover
      const logo = object.basicInfo.media.logo || "";
      const cover = object.basicInfo.media.cover || "";
      object.basicInfo.mediaInfo = {
        logo: {
          name: logo,
          url: getFullImageUrl(logo),
        },
        cover: {
          name: cover,
          url: getFullImageUrl(cover),
        },
      };
    } else {
      // Event: type and name
      const embeddedMedia = object.basicInfo.media;
      const eName = embeddedMedia.name || "";
      const eType = embeddedMedia.type || "image"; // fallback for event
      object.basicInfo.mediaInfo = {
        name: eName,
        type: eType,
        url: getFullImageUrl(eName),
      };
    }
  }

  // Cleanup
  delete highlightObject.media;
  delete highlightObject.__v;
  delete highlightObject.id;
  if (object?.basicInfo?.media) {
    delete object.basicInfo.media;
  }

  return highlightObject;
};



const Highlights = mongoose.model("Highlight", highlightSchema);

module.exports = {
  Highlights,
}
