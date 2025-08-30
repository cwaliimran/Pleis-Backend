const mongoose = require("mongoose");
const { getFullImageUrl } = require("../../helperUtils/imageHelper");
const { LocationSchema } = require("../../shared/locations/locationSchmea");

const venuesSchema = new mongoose.Schema(
  {
    floorPlan: {
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
    venueType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VenueTypes",
      required: true,
    },
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
    toJSON: { virtuals: true, transform: transformDoc },
    toObject: { virtuals: true, transform: transformDoc },
  }
);

// ✅ Virtual field `floorPlanInfo` (computed image + full URL)
venuesSchema.virtual("floorPlanInfo").get(function () {
  const floorPlan = this.floorPlan || "noimage.png";
  const url = getFullImageUrl(floorPlan);
  return { name: floorPlan, url };
});

// ✅ Custom transformation — applies automatically to .toJSON() and .toObject()
function transformDoc(doc, ret) {
  delete ret.floorPlan; // remove original image string
  delete ret.id; // remove original image string
  return ret;
}

venuesSchema.methods.formatResponse = function (venueData) {
  const venue = venueData ? venueData : this.toObject();

  delete venue.__v;
  delete venue.id; // Remove redundant id field

  // Attach full image URL for floorPlan
  venue.floorPlanInfo = {
    name: venue.floorPlan || "noimage.png",
    url: getFullImageUrl(venue.floorPlan || "noimage.png"),
  };
  delete venue.floorPlan;

  return venue;
};


const Venues = mongoose.model("Venues", venuesSchema);

module.exports = Venues;
