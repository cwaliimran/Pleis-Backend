const mongoose = require("mongoose");
const { CONSENT_TYPES, CONSENT_ACTIONS } = require("./legalConstants");

/**
 * Immutable, append-only consent log (spec section 5). Every acceptance (and every
 * withdrawal) is a new row; rows are never updated or deleted — including by account
 * deletion / data cleanup. Mongoose-level guards below reject any mutation.
 */
const consentLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subjectType: { type: String, enum: ["user", "partner"], required: true },
    documentType: { type: String, enum: Object.values(CONSENT_TYPES), required: true },
    action: { type: String, enum: Object.values(CONSENT_ACTIONS), default: CONSENT_ACTIONS.ACCEPTED },
    // Version id of the exact text accepted (LegalDocuments row for stored documents).
    document: { type: mongoose.Schema.Types.ObjectId, ref: "LegalDocuments", default: null },
    documentVersion: { type: String, required: true },
    acceptedAt: { type: Date, required: true, default: () => new Date() }, // UTC
    // e.g. { source: "registration" | "reacceptance" | "club_join", clubId, orderId, ticketId, psaId, text }
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    device: {
      deviceId: { type: String, default: null },
      deviceType: { type: String, default: null },
    },
    platform: { type: String, default: null }, // ios | android | web
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

consentLogSchema.index({ user: 1, documentType: 1, acceptedAt: -1 });
consentLogSchema.index({ "context.clubId": 1, documentType: 1 });

const IMMUTABLE = "Consent log is append-only: records cannot be modified or deleted.";
const block = function () {
  throw new Error(IMMUTABLE);
};
[
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
].forEach((op) => consentLogSchema.pre(op, { document: true, query: true }, block));
consentLogSchema.pre("save", function (next) {
  if (!this.isNew) return next(new Error(IMMUTABLE));
  next();
});
consentLogSchema.pre("bulkWrite", block);

module.exports = mongoose.model("ConsentLogs", consentLogSchema);
