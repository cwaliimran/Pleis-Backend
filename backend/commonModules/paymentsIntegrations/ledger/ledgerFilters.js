function applyLedgerListFilters(match, query = {}) {
  const next = { ...match };
  if (query.confirmationNumber) next.confirmationNumber = query.confirmationNumber;
  if (query.payoutBatchId) next.payoutBatchId = query.payoutBatchId;
  if (query.cardLast4) next.cardLast4 = String(query.cardLast4);
  if (query.module) next.module = query.module;
  if (query.provider) next.provider = query.provider;
  return next;
}

function remainingWiringNotes() {
  return {
    ledgerWrites: "Not hooked into processPaymentWebhook (would write production Mongo).",
    payouts: "PayoutBatch model exists; no pain.001 XML export or bank submit.",
    webhookFilters: "Existing /orders-transactions API unchanged. Use applyLedgerListFilters on a new ledger list route.",
    uniqueIndex:
      "Drop leftover unique index paymentconfirmations.orderId_1_module_1 in Mongo if cancellation inserts fail with E11000.",
  };
}

module.exports = {
  applyLedgerListFilters,
  remainingWiringNotes,
};
