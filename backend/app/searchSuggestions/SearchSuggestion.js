const mongoose = require("mongoose");

const searchSuggestionSchema = new mongoose.Schema(
  {
    docType: {
      type: String,
      enum: ["global", "user"],
      index: true,
      required: true,
    },

    keyword: {
      type: String,
      index: true,
      default: "",
    },

    filters: {
      categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Categories" }],
      venueTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: "VenueTypes" }],
      tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tags" }],
      genre: [{ type: mongoose.Schema.Types.ObjectId, ref: "TagTypes" }],
    },

    filterHash: {
      type: String,
      index: true,
    },

    // GEO DATA
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: null,
      },
    },

    radiusKm: {
      type: Number,
      default: 50,
    },

    day: {
      type: String,
      index: true,
      default: null,
    },

    count: {
      type: Number,
      default: 0,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: undefined,
      index: true,
    },

    lastUsedAt: Date,
    lastSearchedAt: Date,
  },
  { timestamps: true }
);

// GEO INDEX
searchSuggestionSchema.index({ location: "2dsphere" });

// prevent duplicates per geo area + filters
searchSuggestionSchema.index(
  { docType: 1, keyword: 1, filterHash: 1, day: 1 },
  { unique: true, sparse: true }
);

// unique per user + filter
searchSuggestionSchema.index(
  { docType: 1, user: 1, filterHash: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model("SearchSuggestion", searchSuggestionSchema);
