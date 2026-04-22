const mongoose = require("mongoose");

const pinnedContentSchema = new mongoose.Schema(
  {

    filterType: {
      type: String,
      enum: ["Categories", "Tags", "VenueTypes"],
      default: "Tags",
    },
    //type refers to schemas and it will be an array of object ids
    filter:
    {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "filterType",
    },
    // What is being pinned: Event, Organizations
    contentType: {
      type: String,
      enum: ["Event", "Organizations"],
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const PinnedContent = mongoose.model("PinnedContent", pinnedContentSchema);

module.exports = PinnedContent;
