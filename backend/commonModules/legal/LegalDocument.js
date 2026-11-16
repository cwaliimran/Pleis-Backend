const mongoose = require("mongoose");
const { LEGAL_DOCUMENT_TYPES } = require("./legalConstants");

/**
 * One row per published version of a legal document. The text of a version never
 * changes — editing a document publishes a new version, so a consent record always
 * points at the exact text that was accepted.
 */
const legalDocumentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: Object.values(LEGAL_DOCUMENT_TYPES), required: true },
    version: { type: Number, required: true, min: 1 },
    content: { type: String, default: "" },
    // Shown in re-acceptance prompts / partner change notices.
    summary: { type: String, default: "", trim: true },
    effectiveDate: { type: Date, default: Date.now },
    // false = editorial fix: still a new version, but nobody is asked to accept again.
    requiresReacceptance: { type: Boolean, default: true },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

legalDocumentSchema.index({ type: 1, version: -1 }, { unique: true });

const blockMutation = function () {
  throw new Error("Legal document versions are immutable; publish a new version instead.");
};
["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"].forEach((op) =>
  legalDocumentSchema.pre(op, blockMutation)
);
legalDocumentSchema.pre("save", function (next) {
  if (!this.isNew) return next(new Error("Legal document versions are immutable; publish a new version instead."));
  next();
});

module.exports = mongoose.model("LegalDocuments", legalDocumentSchema);
