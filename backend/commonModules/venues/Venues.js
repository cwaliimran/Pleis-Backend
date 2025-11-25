const mongoose = require("mongoose");
const { getFullImageUrl } = require("../../helperUtils/imageHelper");
const { LocationSchema } = require("../../shared/locations/locationSchmea");

const venuesSchema = new mongoose.Schema(
  {
    floorPlan: { //image
      type: String,
      default: "",
    },

    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    pinned: {
      type: Boolean,
      default: false,
    },
venueType: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: "VenueTypes",
  required: true,
}]
,
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
      default: null,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    location: {
      type: LocationSchema,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);


venuesSchema.methods.formatResponse = function (venueData) {
  const venue = venueData ? venueData : this.toObject();

  delete venue.__v;
  // Attach full image URL for floorPlan
  venue.floorPlan = getFullImageUrl(venue.floorPlan || "noimage.png");

  return venue;
};

venuesSchema.index({ organization: 1 });

const Venues = mongoose.model("Venues", venuesSchema);

module.exports = Venues;
