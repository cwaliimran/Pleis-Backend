/**
 * Document sweeper — keeps customer documents from getting stuck (#25).
 *
 * A document job retries 8 times over about 10 minutes and then stays failed.
 * An outage longer than that (Billko down, no PDF engine, Redis restart) would
 * otherwise leave paid orders without their confirmation or invoice. Every run:
 *
 *   1. Retries the failed jobs of the fiscal-documents queue, one attempt each,
 *      except jobs that can never succeed (order gone, invalid job) — those
 *      wait for a person.
 *   2. Queues a document for every captured Pleis payment (ordering,
 *      reservation) that still has none, covering jobs that were never queued
 *      or have dropped out of the queue.
 *
 * Safe to repeat: issuing is idempotent — an existing confirmation is reused
 * (only a missing PDF or email is redone) and a Billko invoice that exists is
 * never issued again.
 */
const PaymentLedgerEntry = require("../../paymentsIntegrations/ledger/PaymentLedgerEntry.model");
const PaymentConfirmation = require("../models/PaymentConfirmation.model");
const BillkoInvoice = require("../models/BillkoInvoice.model");
const { fiscalDocumentsQueue, enqueueFiscalDocument } = require("../../../bullmq/queues");

// Leave fresh payments to the normal path (queued at payment, retried for ~10 min).
const MIN_AGE_MS = 15 * 60 * 1000;
// Older than this needs a person, not a retry loop.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RETRIES_PER_RUN = 100;
const MAX_ENQUEUES_PER_RUN = 50;

/** Failures a retry cannot fix. */
const PERMANENT_FAILURES = [
  /_not_found$/,
  /^not_a_subscription_transaction$/,
  /^original_confirmation_required$/,
  /^fiscal_document_job_invalid$/,
  /^unsupported_fiscal_document_kind/,
];

const isPermanentFailure = (reason) =>
  PERMANENT_FAILURES.some((pattern) => pattern.test(String(reason || "")));

/** Captured payments whose document is issued at payment. Ticketing invoices
 * are issued at the first check-in, so they are only retried (step 1). */
const KIND_BY_MODULE = {
  ORDERING: "ordering_confirmation",
  RESERVATION: "reservation_confirmation",
};

async function retryFailedJobs(now) {
  const failed = await fiscalDocumentsQueue.getFailed(0, 499);
  const counts = { retried: 0, permanent: 0, tooOld: 0 };
  for (const job of failed) {
    if (counts.retried >= MAX_RETRIES_PER_RUN) break;
    if (isPermanentFailure(job.failedReason)) {
      counts.permanent += 1;
      continue;
    }
    if (now - (job.timestamp || 0) > MAX_AGE_MS) {
      counts.tooOld += 1;
      continue;
    }
    try {
      await job.retry("failed");
      counts.retried += 1;
    } catch (err) {
      console.error(`[document-sweeper] retry ${job.id} failed:`, err.message);
    }
  }
  return counts;
}

async function enqueueMissingDocuments(now) {
  const rows = await PaymentLedgerEntry.find(
    {
      paymentChannel: "pleis",
      module: { $in: Object.keys(KIND_BY_MODULE) },
      capturedAt: { $gte: new Date(now - MAX_AGE_MS), $lte: new Date(now - MIN_AGE_MS) },
    },
    { module: 1, orderId: 1 },
  ).lean();
  const counts = { missing: 0, queued: 0, alreadyQueued: 0 };
  if (!rows.length) return counts;

  const ids = rows.map((row) => row.orderId);
  const [withConfirmation, withInvoice] = await Promise.all([
    PaymentConfirmation.distinct("orderId", { orderId: { $in: ids } }),
    BillkoInvoice.distinct("orderId", { orderId: { $in: ids } }),
  ]);
  const documented = new Set([...withConfirmation, ...withInvoice].map(String));

  for (const row of rows) {
    if (documented.has(String(row.orderId))) continue;
    counts.missing += 1;
    if (counts.queued >= MAX_ENQUEUES_PER_RUN) continue;

    const kind = KIND_BY_MODULE[row.module];
    const orderId = String(row.orderId);
    const existing = await fiscalDocumentsQueue.getJob(`${kind}-${orderId}`);
    const state = existing ? await existing.getState() : null;
    if (state === "failed" || state === "waiting" || state === "active" || state === "delayed") {
      counts.alreadyQueued += 1; // failed ones are retried in step 1
      continue;
    }
    // A completed job with no document (e.g. it ran before the order was paid)
    // would block a new job with the same id.
    if (state === "completed") await existing.remove();
    await enqueueFiscalDocument({ kind, orderId });
    counts.queued += 1;
  }
  return counts;
}

async function sweepFiscalDocuments({ now = Date.now() } = {}) {
  const retried = await retryFailedJobs(now);
  const missing = await enqueueMissingDocuments(now);
  const summary = { ...retried, ...missing };
  if (summary.retried || summary.queued || summary.permanent || summary.missing) {
    console.log("[document-sweeper]", JSON.stringify(summary));
  }
  return summary;
}

module.exports = { sweepFiscalDocuments, isPermanentFailure };
