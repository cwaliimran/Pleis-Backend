const mongoose = require("mongoose");

const geoSchema = new mongoose.Schema(
  {
    country: String,
    countryCode: String,
    region: String,
    regionName: String,
    city: String,
    zip: String,
    lat: Number,
    lon: Number,
    query: String,
  },
  { _id: false },
);

/**
 * One document per client IP — rolling threat profile + block state.
 */
const ipThreatProfileSchema = new mongoose.Schema(
  {
    ip: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    geo: geoSchema,
    geoFetchedAt: Date,
    stats: {
      failedLogin: { type: Number, default: 0 },
      failedOtp: { type: Number, default: 0 },
      rateLimited: { type: Number, default: 0 },
      totalEvents: { type: Number, default: 0 },
      firstSeenAt: { type: Date, default: Date.now },
      lastEventAt: { type: Date, default: Date.now },
    },
    status: {
      type: String,
      enum: ["active", "watched", "blocked"],
      default: "active",
      index: true,
    },
    block: {
      reason: { type: String, default: null },
      blockedAt: { type: Date, default: null },
      blockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      // null = permanent
      blockedUntil: { type: Date, default: null },
      auto: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

ipThreatProfileSchema.index({ "stats.lastEventAt": -1 });
ipThreatProfileSchema.index({ status: 1, "stats.lastEventAt": -1 });

/**
 * Append-only event log for forensics (brute-force attempts, 429s, etc.).
 */
const ipThreatEventSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: [
        "failed_login",
        "failed_otp",
        "rate_limited",
        "blocked_hit",
        "manual_block",
        "manual_unblock",
        "auto_block",
        "other",
      ],
      index: true,
    },
    path: String,
    method: String,
    userAgent: String,
    // Never store passwords — email is useful for attack correlation
    email: String,
    endpoint: String,
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    geo: geoSchema,
  },
  { timestamps: true },
);

ipThreatEventSchema.index({ ip: 1, createdAt: -1 });
ipThreatEventSchema.index({ type: 1, createdAt: -1 });
// TTL optional via env later — keep events for investigation by default

const IpThreatProfile = mongoose.model("IpThreatProfile", ipThreatProfileSchema);
const IpThreatEvent = mongoose.model("IpThreatEvent", ipThreatEventSchema);

module.exports = { IpThreatProfile, IpThreatEvent };
