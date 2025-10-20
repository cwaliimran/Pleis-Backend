const mongoose = require("mongoose");

const pinnedContentSchema = new mongoose.Schema(
  {

    type: {
      type: String,
      enum: ["categories", "tags", "venues"],
      default: "categories",
    },
    //type refers to schemas and it will be an array of object ids
    object:
    {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "type",
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
