const mongoose = require("mongoose");

// One stored code (Requirement Set #59, Defects Report D-01).
//
// The printed / shared link carries only `token`: short, unique, opaque and
// never the record id. The server resolves the token to the code's type, the
// organization, the venue and the target (table, event, loyalty club, …).
// A code whose status is not "active" is revoked: its token resolves to
// nothing and, being unique, is never issued again.
const globalQrSchema = new mongoose.Schema(
  {
    // Legacy: an uploaded PNG. Codes are now rendered from `link`.
    image: { type: String, default: "" },
    // Human-readable text printed next to the code.
    label: { type: String, trim: true, required: true },

    token: { type: String, trim: true },

    // Define the type of global QR promotion
    globalQrType: {
      type: String,
      required: true,
      enum: ["organization", "event", "loyalty", "checkInOrder", "checkInTableID", "reservation"],
    },

    // Resolved on create from the target.
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organizations", default: null },
    venue: { type: mongoose.Schema.Types.ObjectId, ref: "Venues", default: null },

    // "generator": made by an organizer / admin on the QR codes page.
    // "share": issued by the app's share button when the content had no code yet (#83).
    source: { type: String, enum: ["generator", "share"], default: "generator" },

    status: {
      type: String,
      enum: ["active", "inactive", "completed", "deleted"],
      default: "active",
    },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    discriminatorKey: "globalQrType",
  }
);

globalQrSchema.index({ token: 1 }, { unique: true, sparse: true });

module.exports =
  mongoose.models.GlobalQr ||
  mongoose.model("GlobalQr", globalQrSchema);
