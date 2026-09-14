const crypto = require("crypto");
const PaymentLedgerEntry = require("./PaymentLedgerEntry.model");
const PaymentAttemptLog = require("./PaymentAttemptLog.model");

function hashPayload(payload) {
  if (!payload) return "";
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  return crypto.createHash("sha256").update(json).digest("hex");
}

function buildLedgerEntryInput(event) {
  return {
    schemaVersion: 5,
    orderId: event.orderId,
    orderType: event.orderType,
    module: event.module,
    organization: event.organization,
    companyOrganizer: event.companyOrganizer,
    user: event.user,
    provider: event.provider || "monri",
    providerTransactionId: event.providerTransactionId,
    confirmationNumber: event.confirmationNumber,
    amountCents: Math.round(Number(event.amount || 0) * 100),
    currency: event.currency || "EUR",
    paymentStatus: event.paymentStatus,
    paymentMethod: event.paymentMethod,
    cardLast4: event.cardLast4 || null,
    cardBrand: event.cardBrand || null,
    payoutBatchId: event.payoutBatchId || null,
    invoiceIds: event.invoiceIds || [],
    notes: event.notes || "",
  };
}

async function writePaymentLedgerEntry(event) {
  const doc = buildLedgerEntryInput(event);
  if (!doc.orderId || !doc.orderType || !doc.paymentStatus) {
    return { skipped: true, reason: "incomplete_ledger_event" };
  }
  return PaymentLedgerEntry.create(doc);
}

async function writePaymentAttemptLog(event) {
  if (!event?.orderNumber || !event?.status) {
    return { skipped: true, reason: "incomplete_attempt_event" };
  }
  return PaymentAttemptLog.create({
    schemaVersion: 5,
    orderNumber: String(event.orderNumber),
    orderType: event.orderType,
    provider: event.provider || "monri",
    status: event.status,
    amountCents:
      event.amountCents != null
        ? event.amountCents
        : Math.round(Number(event.amount || 0) * 100),
    currency: event.currency || "EUR",
    payloadHash: event.payloadHash || hashPayload(event.payload),
    errorCode: event.errorCode || "",
    attemptedAt: event.attemptedAt || new Date(),
  });
}

module.exports = {
  hashPayload,
  buildLedgerEntryInput,
  writePaymentLedgerEntry,
  writePaymentAttemptLog,
};
