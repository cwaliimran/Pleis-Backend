function applyLedgerListFilters(match, query = {}) {
  const next = { ...match };
  if (query.confirmationNumber) next.confirmationNumber = query.confirmationNumber;
  if (query.payoutBatchId) next.payoutBatchId = query.payoutBatchId;
  if (query.statementId) next.statementId = query.statementId;
  if (query.payoutStatus) next.payoutStatus = query.payoutStatus;
  if (query.fiscalizationStatus) next.fiscalizationStatus = query.fiscalizationStatus;
  if (query.cardLast4) next.cardLast4 = String(query.cardLast4);
  if (query.module) next.module = query.module;
  if (query.provider) next.provider = query.provider;
  return next;
}

/**
 * Phase A vs later phases — what is gated / wired now.
 *
 * Gated now (payment create paths):
 *   assertOrganizerBillkoReady — Billko API key encrypted on companyDetails
 *
 * Available now (not blocking capture; for statement generation / ops):
 *   assertOrganizerPayoutReady / getOrganizerPayoutReadiness — OIB + IBAN
 *   (bankAccountNumber). Incomplete payout data stays PENDING per §2.3;
 *   do not auto-EXCLUDED.
 *
 * Phase B (ledger/statementService + admin /payouts): pain.001 generate/confirm/cancel.
 * Bank upload remains manual. Fiscalize is separate (Phase C).
 *
 * Phase C (ledger/fiscalizeService + offAppFiscalizeService + admin /payouts):
 *   Fiscalize batch, commission eRačun, off-app batch. Live Billko gated by
 *   BILLKO_FISCALIZE_ENABLED=true (dry-run otherwise).
 */
function remainingWiringNotes() {
  return {
    ledgerWrites:
      "Wired on paid capture via recordPaidCaptureLedger from processPaymentWebhook + order finalizers (idempotent on orderId+module).",
    payoutStatus:
      "Ticketing→HELD; Ordering→PENDING; Reservation/Subscription→EXCLUDED with machine reason. Cash ordering→EXCLUDED OFF_APP_PAYMENT.",
    payouts: "Phase B: statement generate/confirm/cancel + pain.001 download under /admin/payouts. Manual bank upload only.",
    fiscalize:
      "Phase C: POST /admin/payouts/fiscalize (PAID + NOT_FISCALIZED) → Pleis→organizer commission eRačun. Gate: BILLKO_FISCALIZE_ENABLED.",
    offApp:
      "Phase C: /admin/payouts/off-app-batches — ordering cash/external; confirm → commission eRačun; never in pain.001.",
    organizerGates: {
      billkoReady: "assertOrganizerBillkoReady — blocks create when API key missing",
      payoutReady:
        "assertOrganizerPayoutReady — OIB+IBAN check for Phase B statement gen; not blocking capture",
      phaseBDelivered: [
        "statement generate/confirm/cancel + pain.001",
        "IBAN checksum + OIB mod-11 at statement time",
        "PLEIS_LOCKED_IBAN / PLEIS_OPERATING_IBAN config",
      ],
      phaseCDelivered: [
        "Fiscalize batch / commission eRačun (BILLKO_FISCALIZE_ENABLED)",
        "off-app batch generate/confirm/cancel",
      ],
      stillManual: ["bank upload UI (manual — never auto-submit)"],
    },
    webhookFilters:
      "Existing /orders-transactions API unchanged. Use applyLedgerListFilters on a new ledger list route.",
    uniqueIndex:
      "Drop leftover unique index paymentconfirmations.orderId_1_module_1 in Mongo if cancellation inserts fail with E11000.",
  };
}

module.exports = {
  applyLedgerListFilters,
  remainingWiringNotes,
};
