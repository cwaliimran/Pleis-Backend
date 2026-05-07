const mongoose = require("mongoose");

const feedConfigSchema = new mongoose.Schema(
  {
    quickAction: { //hides/shows categories on the app home feed
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);


const FeedConfig = mongoose.model("FeedConfig", feedConfigSchema);

module.exports = FeedConfig;
