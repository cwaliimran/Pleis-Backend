const mongoose = require("mongoose");

const popularEventsSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    isTop10: {
      type: Boolean,
      default: false,
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

//add index on status
popularEventsSchema.index({ status: 1 });

const PopularEvents = mongoose.model("PopularEvents", popularEventsSchema);

module.exports = PopularEvents;
