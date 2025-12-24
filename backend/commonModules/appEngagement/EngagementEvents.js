const mongoose = require("mongoose");

const engagementEventSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      //users refers to company organizers
      enum: ["organizations", "events", "users"],
      required: true
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },

    action: {
      type: String,
      enum: ["view", "favorite", "share", "open"],
      required: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false
    },

    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: false }
);

/* =====================================================
   INDEXES
   ===================================================== */

// Core analytics (trending, popularity)
engagementEventSchema.index(
  { entityType: 1, entityId: 1, action: 1, createdAt: -1 }
);

// Time scans (cleanup, windows)
engagementEventSchema.index(
  { createdAt: -1 }
);

// Anti-spam / dedup (views, clicks)
engagementEventSchema.index(
  { userId: 1, entityType: 1, entityId: 1, action: 1, createdAt: -1 },
  { sparse: true }
);

// Entity aggregation
engagementEventSchema.index(
  { entityType: 1, entityId: 1 }
);

// 🔒 HARD SAFETY: only ONE favorite per user per entity
engagementEventSchema.index(
  { userId: 1, entityType: 1, entityId: 1, action: 1 },
  {
    unique: true,
    partialFilterExpression: { action: "favorite" }
  }
);

const EngagementEvents = mongoose.model(
  "EngagementEvents",
  engagementEventSchema
);

module.exports = EngagementEvents;
