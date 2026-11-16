const mongoose = require("mongoose");

/**
 * One run of the daily document reconciliation (#25, Billko v2.9 §13.3).
 * Read-only report: exceptions are listed for operations, nothing is changed.
 */
const exceptionSchema = new mongoose.Schema(
  {
    code: { type: String, enum: ["DOCUMENT_WITHOUT_CAPTURE", "CAPTURE_WITHOUT_DOCUMENT"], required: true },
    documentType: { type: String, default: "" },
    documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    documentNumber: { type: String, default: "" },
    module: { type: String, default: "" },
    orderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    orderReference: { type: String, default: "" },
    issuedAt: { type: Date, default: null },
  },
  { _id: false },
);

const documentReconciliationReportSchema = new mongoose.Schema(
  {
    runAt: { type: Date, required: true, index: true },
    trigger: { type: String, enum: ["cron", "manual"], default: "cron" },
    ok: { type: Boolean, required: true },
    summary: { type: Object, default: {} },
    exceptions: { type: [exceptionSchema], default: [] },
    truncated: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.DocumentReconciliationReport ||
  mongoose.model("DocumentReconciliationReport", documentReconciliationReportSchema);
