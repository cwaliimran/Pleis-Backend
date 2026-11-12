/**
 * Run the daily document reconciliation once, by hand (#25, Billko v2.9 §13.3).
 * Read-only: it stores a report in documentreconciliationreports and prints it.
 *
 * Usage:  NODE_ENV=dev node backend/scripts/runDocumentReconciliation.js
 */
const path = require("path");
const NODE_ENV = process.env.NODE_ENV || "dev";
require("dotenv").config({ path: path.join(__dirname, "..", "..", `.env.${NODE_ENV}`), override: true });
const mongoose = require("mongoose");
const { runDocumentReconciliation } = require("../commonModules/paymentsIntegrations/ledger/documentReconciliationService");

(async () => {
  const uri = process.env.BASE_URL;
  if (!uri) throw new Error("No Mongo URI in the environment file");
  await mongoose.connect(uri);
  try {
    const report = await runDocumentReconciliation({ trigger: "manual" });
    console.log(JSON.stringify({ ok: report.ok, summary: report.summary, exceptions: report.exceptions }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
