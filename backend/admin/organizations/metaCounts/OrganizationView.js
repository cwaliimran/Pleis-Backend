// models/OrganizationView.js
const mongoose = require("mongoose");

const OrganizationViewSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
      required: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Users", default: null },
    ipAddress: { type: String, default: null },
    lastViewedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Prevent duplicates: one per user or IP
OrganizationViewSchema.index({ organization: 1, user: 1 }, { unique: true, sparse: true });
OrganizationViewSchema.index({ organization: 1, ipAddress: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("OrganizationViews", OrganizationViewSchema);
