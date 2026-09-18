/**
 * Admin-facing BillKO Imperial Lake B2B document + payment reporting.
 * Complements Phase B SEPA statements and Phase C Fiscalize:
 * bank money movement stays manual (pain.001); Lake reports tax-side
 * payment on outgoing B2B eInvoices and lists incoming supplier invoices.
 */

const BillkoInvoice = require("../../fiscalDocuments/models/BillkoInvoice.model");
const {
  isBillkoLakeEnabled,
  hasLakeCredentials,
  getIncomingDocuments,
  getOutgoingDocuments,
  getDocumentStatus,
  reportOutgoingPayment,
  EREPORTING_PAYMENT_TYPE,
  DOCUMENT_STATUS,
  lakePing,
} = require("../billko/billkoImperialLakeClient");

function assertLakeReady() {
  if (!isBillkoLakeEnabled()) {
    const err = new Error("billko_lake_disabled");
    err.code = "BILLKO_LAKE_DISABLED";
    err.statusCode = 503;
    throw err;
  }
  if (!hasLakeCredentials()) {
    const err = new Error("billko_lake_credentials_missing");
    err.code = "BILLKO_LAKE_AUTH";
    err.statusCode = 503;
    throw err;
  }
}

function ymd(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    const err = new Error("invalid_payment_date");
    err.code = "INVALID_PAYMENT_DATE";
    err.statusCode = 400;
    throw err;
  }
  return d.toISOString().slice(0, 10);
}

function pickDocumentQuery(query = {}) {
  const params = {};
  for (const key of [
    "insertedFrom",
    "insertedTo",
    "modifiedFrom",
    "modifiedTo",
    "issuedFrom",
    "issuedTo",
    "status",
    "limit",
    "offset",
  ]) {
    if (query[key] != null && query[key] !== "") params[key] = query[key];
  }
  if (params.limit != null) params.limit = Number(params.limit);
  if (params.offset != null) params.offset = Number(params.offset);
  if (params.status != null) params.status = Number(params.status);
  return params;
}

async function getLakeStatus() {
  const enabled = isBillkoLakeEnabled();
  const credentialsConfigured = hasLakeCredentials();
  let ping = null;
  let pingError = null;
  if (enabled && credentialsConfigured) {
    try {
      ping = await lakePing();
    } catch (err) {
      pingError = err.message;
    }
  }
  return {
    enabled,
    credentialsConfigured,
    ready: enabled && credentialsConfigured && !pingError,
    ping,
    pingError,
    documentStatuses: DOCUMENT_STATUS,
    paymentTypes: EREPORTING_PAYMENT_TYPE,
  };
}

async function listIncoming(query = {}) {
  assertLakeReady();
  const items = await getIncomingDocuments(pickDocumentQuery(query));
  return { items, count: items.length };
}

async function listOutgoing(query = {}) {
  assertLakeReady();
  const items = await getOutgoingDocuments(pickDocumentQuery(query));
  return { items, count: items.length };
}

async function getStatus(documentId) {
  assertLakeReady();
  return getDocumentStatus(documentId);
}

/**
 * Report payment for an outgoing Lake document (seller = Pleis).
 * Optionally persist on a local BillkoInvoice when invoiceId / orderNumber given.
 */
async function reportPayment({
  documentId,
  paymentDate,
  paidAmount,
  paymentType = EREPORTING_PAYMENT_TYPE.ClearingBetweenPartners,
  invoiceId = null,
  orderNumber = null,
} = {}) {
  assertLakeReady();

  const body = {
    paymentDate: ymd(paymentDate || new Date()),
    paidAmount: Number(paidAmount),
    paymentType: Number(paymentType),
  };
  if (Number.isNaN(body.paidAmount)) {
    const err = new Error("invalid_paid_amount");
    err.code = "INVALID_PAID_AMOUNT";
    err.statusCode = 400;
    throw err;
  }

  const remote = await reportOutgoingPayment(documentId, body);
  const at = new Date();

  let invoice = null;
  const findQ = {};
  if (invoiceId) findQ._id = invoiceId;
  else if (orderNumber) findQ.orderNumber = orderNumber;
  else findQ.lakeDocumentId = String(documentId);

  if (Object.keys(findQ).length) {
    invoice = await BillkoInvoice.findOneAndUpdate(
      findQ,
      {
        $set: {
          lakeDocumentId: String(documentId),
          paymentReportedAt: at,
          paymentReport: {
            paymentDate: body.paymentDate,
            paidAmount: body.paidAmount,
            paymentType: body.paymentType,
            reportedAt: at,
            response: remote,
          },
        },
      },
      { new: true },
    ).lean();
  }

  return {
    documentId: Number(documentId) || documentId,
    reported: true,
    payment: body,
    remote,
    invoice,
  };
}

/**
 * After live Fiscalize creates a commission invoice, best-effort match an
 * outgoing Lake document by invoice number and report payment (commission
 * already withheld at SEPA payout — ClearingBetweenPartners).
 */
async function reportPaymentForCommissionInvoice(invoice, { force = false } = {}) {
  if (!invoice) return { skipped: true, reason: "no_invoice" };
  if (!isBillkoLakeEnabled() || !hasLakeCredentials()) {
    return { skipped: true, reason: "lake_not_ready" };
  }
  if (invoice.paymentReportedAt && !force) {
    return { skipped: true, reason: "already_reported" };
  }

  const amount = Number(invoice.amount);
  if (!(amount > 0)) {
    return { skipped: true, reason: "zero_amount" };
  }

  let documentId = invoice.lakeDocumentId
    ? Number(invoice.lakeDocumentId) || invoice.lakeDocumentId
    : null;

  if (!documentId && invoice.invoiceNumber) {
    const outgoing = await getOutgoingDocuments({
      limit: 200,
      offset: 0,
    });
    const needle = String(invoice.invoiceNumber).trim();
    const match = (outgoing || []).find(
      (doc) => String(doc.documentId || "").trim() === needle,
    );
    if (match?.id != null) documentId = match.id;
  }

  if (!documentId) {
    return {
      skipped: true,
      reason: "lake_document_not_found",
      invoiceNumber: invoice.invoiceNumber || null,
      hint: "Commission invoices created via /api-client may not appear in Imperial Lake until sent as UBL via document/send.",
    };
  }

  return reportPayment({
    documentId,
    paymentDate: invoice.paymentReportedAt || new Date(),
    paidAmount: amount,
    paymentType: EREPORTING_PAYMENT_TYPE.ClearingBetweenPartners,
    invoiceId: invoice._id,
  });
}

module.exports = {
  getLakeStatus,
  listIncoming,
  listOutgoing,
  getStatus,
  reportPayment,
  reportPaymentForCommissionInvoice,
  assertLakeReady,
  DOCUMENT_STATUS,
  EREPORTING_PAYMENT_TYPE,
};
