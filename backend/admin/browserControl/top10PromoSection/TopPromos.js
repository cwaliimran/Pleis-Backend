const mongoose = require("mongoose");

const topPromosSchema = new mongoose.Schema(
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
topPromosSchema.index({ status: 1 });

const TopPromos = mongoose.model("TopPromos", topPromosSchema);

module.exports = TopPromos;
