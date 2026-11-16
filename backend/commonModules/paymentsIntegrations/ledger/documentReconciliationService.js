/**
 * Daily document reconciliation — Requirement Set v13.8 #25, Billko v2.9 §13.3.
 *
 *   1. No document of any kind may exist for a payment that never reached a
 *      captured state. Every payment confirmation and every guest-payment
 *      Billko invoice is checked against its payment. Reported as
 *      DOCUMENT_WITHOUT_CAPTURE.
 *   2. Every captured payment Pleis collected (payout track) must have either
 *      a Billko invoice or a payment confirmation. Reported as
 *      CAPTURE_WITHOUT_DOCUMENT once the capture is older than the grace
 *      period, so documents still being generated are not reported.
 *
 * "Captured" means: the payment ledger has a row for (module, orderId) — the
 * ledger is written only on a captured payment (#10) — or the order itself is
 * paid / refunded. Exceptions are stored in documentreconciliationreports and
 * logged; nothing is changed or deleted.
 *
 * Commission invoices, refund stornos and subscription invoices are not tied to
 * a guest capture in the payment ledger and are not part of check 1.
 */
const mongoose = require("mongoose");
const PaymentLedgerEntry = require("./PaymentLedgerEntry.model");
const PaymentConfirmation = require("../../fiscalDocuments/models/PaymentConfirmation.model");
const BillkoInvoice = require("../../fiscalDocuments/models/BillkoInvoice.model");
const DocumentReconciliationReport = require("./DocumentReconciliationReport.model");

const CAPTURE_GRACE_MS = 6 * 60 * 60 * 1000; // documents are generated within minutes; 6 h is generous
const CAPTURED_ORDER_STATUSES = ["paid", "refunded", "partiallyRefunded", "partially_refunded"];
const MAX_EXCEPTIONS_STORED = 500;

/** BillkoInvoice.orderType → ledger module + order collection. */
const INVOICE_ORDER_TYPES = {
  menuorders: { module: "ORDERING", collection: "menuorders" },
  userreservations: { module: "RESERVATION", collection: "userreservations" },
  ticketingbookings: { module: "TICKETING", collection: "ticketingorders" },
};
/** PaymentConfirmation.module → order collection. */
const CONFIRMATION_COLLECTION = {
  ORDERING: "menuorders",
  RESERVATION: "userreservations",
  TICKETING: "ticketingorders",
};

const key = (module, orderId) => `${module}:${String(orderId)}`;

/** Set of "MODULE:orderId" pairs that reached a captured state. */
const loadCapturedPairs = async (pairs) => {
  const captured = new Set();
  if (!pairs.length) return captured;

  const byModule = {};
  for (const { module, orderId } of pairs) (byModule[module] ||= []).push(orderId);

  for (const [module, ids] of Object.entries(byModule)) {
    const rows = await PaymentLedgerEntry.find({ module, orderId: { $in: ids } }, { orderId: 1 }).lean();
    rows.forEach((row) => captured.add(key(module, row.orderId)));
  }

  // Fallback for payments captured before the ledger existed: the order's own status.
  const db = mongoose.connection.db;
  for (const { module, orderId, collection } of pairs) {
    if (captured.has(key(module, orderId)) || !collection) continue;
    const order = await db
      .collection(collection)
      .findOne({ _id: orderId }, { projection: { paymentStatus: 1, "paymentDetails.paymentStatus": 1 } });
    const status = order?.paymentStatus || order?.paymentDetails?.paymentStatus;
    if (CAPTURED_ORDER_STATUSES.includes(status)) captured.add(key(module, orderId));
  }
  return captured;
};

const runDocumentReconciliation = async ({ now = new Date(), trigger = "cron" } = {}) => {
  const exceptions = [];

  /* ---------- 1. documents without a captured payment ---------- */
  const confirmations = await PaymentConfirmation.find(
    { status: { $ne: "CANCELLED" } },
    { confirmationNumber: 1, module: 1, orderId: 1, orderReference: 1, issuedAt: 1 },
  ).lean();
  const invoices = await BillkoInvoice.find(
    { orderType: { $in: Object.keys(INVOICE_ORDER_TYPES) }, kind: { $nin: ["refund_storno", "commission"] } },
    { kind: 1, orderType: 1, orderId: 1, orderNumber: 1, invoiceNumber: 1, status: 1, createdAt: 1 },
  ).lean();

  const pairs = [
    ...confirmations.map((c) => ({ module: c.module, orderId: c.orderId, collection: CONFIRMATION_COLLECTION[c.module] })),
    ...invoices.map((i) => ({
      module: INVOICE_ORDER_TYPES[i.orderType].module,
      orderId: i.orderId,
      collection: INVOICE_ORDER_TYPES[i.orderType].collection,
    })),
  ];
  const captured = await loadCapturedPairs(pairs);

  for (const c of confirmations) {
    if (captured.has(key(c.module, c.orderId))) continue;
    exceptions.push({
      code: "DOCUMENT_WITHOUT_CAPTURE",
      documentType: "payment_confirmation",
      documentId: c._id,
      documentNumber: c.confirmationNumber,
      module: c.module,
      orderId: c.orderId,
      orderReference: c.orderReference || "",
      issuedAt: c.issuedAt || null,
    });
  }
  for (const i of invoices) {
    const module = INVOICE_ORDER_TYPES[i.orderType].module;
    if (captured.has(key(module, i.orderId))) continue;
    exceptions.push({
      code: "DOCUMENT_WITHOUT_CAPTURE",
      documentType: `billko_invoice:${i.kind}`,
      documentId: i._id,
      documentNumber: i.invoiceNumber || "",
      module,
      orderId: i.orderId,
      orderReference: i.orderNumber || "",
      issuedAt: i.createdAt || null,
    });
  }

  /* ---------- 2. captured Pleis payments without any document ---------- */
  const capturedRows = await PaymentLedgerEntry.find(
    {
      paymentChannel: "pleis",
      module: { $in: ["ORDERING", "RESERVATION", "TICKETING"] },
      capturedAt: { $lte: new Date(now.getTime() - CAPTURE_GRACE_MS) },
    },
    { module: 1, orderId: 1, capturedAt: 1, amountCents: 1 },
  ).lean();
  if (capturedRows.length) {
    const ids = capturedRows.map((r) => r.orderId);
    const [withConfirmation, withInvoice] = await Promise.all([
      PaymentConfirmation.distinct("orderId", { orderId: { $in: ids } }),
      BillkoInvoice.distinct("orderId", { orderId: { $in: ids } }),
    ]);
    const documented = new Set([...withConfirmation, ...withInvoice].map(String));
    for (const row of capturedRows) {
      if (documented.has(String(row.orderId))) continue;
      exceptions.push({
        code: "CAPTURE_WITHOUT_DOCUMENT",
        documentType: "",
        documentId: null,
        documentNumber: "",
        module: row.module,
        orderId: row.orderId,
        orderReference: "",
        issuedAt: row.capturedAt || null,
      });
    }
  }

  const summary = {
    confirmationsChecked: confirmations.length,
    invoicesChecked: invoices.length,
    capturesChecked: capturedRows.length,
    documentsWithoutCapture: exceptions.filter((e) => e.code === "DOCUMENT_WITHOUT_CAPTURE").length,
    capturesWithoutDocument: exceptions.filter((e) => e.code === "CAPTURE_WITHOUT_DOCUMENT").length,
  };

  const report = await DocumentReconciliationReport.create({
    runAt: now,
    trigger,
    ok: exceptions.length === 0,
    summary,
    exceptions: exceptions.slice(0, MAX_EXCEPTIONS_STORED),
    truncated: exceptions.length > MAX_EXCEPTIONS_STORED,
  });

  if (exceptions.length) {
    console.warn(
      `[document-reconciliation] ${summary.documentsWithoutCapture} document(s) without a captured payment, ` +
        `${summary.capturesWithoutDocument} captured payment(s) without a document — report ${report._id}`,
    );
  } else {
    console.log("[document-reconciliation] no exceptions");
  }
  return report.toObject();
};

const getLatestReport = () => DocumentReconciliationReport.findOne().sort({ runAt: -1 }).lean();

module.exports = { runDocumentReconciliation, getLatestReport };
