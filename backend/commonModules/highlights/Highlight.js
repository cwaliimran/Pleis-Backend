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
    object: {
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
  }
);


highlightSchema.methods.toCustomJSON = function (highlightData) {
  const highlight = this;
  const highlightObject = highlightData
    ? highlightData
    : highlight.toObject({ virtuals: true });

  // Always attach root-level media
  highlightObject.media = getFullImageUrl(highlightObject.media.name);

  // Populated object media
  const object = highlightObject.object;
  if (object?.basicInfo?.media) {
    if (highlightObject.type === "organization") {
      // Organization: logo and cover
      object.basicInfo.media = getFullImageUrl(object.basicInfo.media.logo);
      object.basicInfo.cover = getFullImageUrl(object.basicInfo.media.cover);
    } else {
      // Event: type and name
      const embeddedMedia = object.basicInfo.media;
      object.basicInfo.media = getFullImageUrl(embeddedMedia.name);
    }
  }

  // Cleanup
  delete highlightObject.__v;

  return highlightObject;
};



const Highlights = mongoose.model("Highlight", highlightSchema);

module.exports = {
  Highlights,
}
