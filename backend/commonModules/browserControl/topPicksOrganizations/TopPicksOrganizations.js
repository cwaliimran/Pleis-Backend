const mongoose = require("mongoose");

const topPicksOrganizationsSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
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
topPicksOrganizationsSchema.index({ status: 1 });

const TopPicksOrganizations = mongoose.model("TopPicksOrganizations", topPicksOrganizationsSchema);

module.exports = TopPicksOrganizations;
