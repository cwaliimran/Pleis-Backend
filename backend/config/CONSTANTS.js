// ORIGINAL flat ticketing service fee (restore if needed):
// const TAX_RATE_BOOKING = 0.06;

/**
 * Ticketing service fee — DOC / Core / Payout §4.2:
 *   fee = min(base, 30 EUR) + 8% of item
 * Worked example: ticket 30.00 EUR → 3.00 + 2.40 = 5.40 EUR (540 cents).
 * Compute in integer cents; never use floats for the final amount.
 */
const SERVICE_FEE_BASE_CENTS = 300; // 3.00 EUR
const SERVICE_FEE_BASE_CAP_CENTS = 3000; // 30.00 EUR
const SERVICE_FEE_RATE = 0.08;

/**
 * Reservation min-spend voucher: no Pleis tax/service fee on the prepaid voucher.
 * Tax applies later on menu items when the voucher is spent (organizer fiscalizes those).
 * Kept at 0 — do not reintroduce a reservation tax line on payment confirmations.
 */
const TAX_RATE_RESERVATION = 0;

function computeTicketingServiceFeeCents(itemPriceCents) {
  const price = Math.max(0, Math.round(Number(itemPriceCents) || 0));
  if (price <= 0) return 0;
  const base = Math.min(SERVICE_FEE_BASE_CENTS, SERVICE_FEE_BASE_CAP_CENTS);
  const percent = Math.round(price * SERVICE_FEE_RATE);
  return base + percent;
}

function computeTicketingServiceFeeEur(itemPriceEur) {
  const cents = Math.round(Number(itemPriceEur || 0) * 100);
  return computeTicketingServiceFeeCents(cents) / 100;
}

module.exports = {
  // TAX_RATE_BOOKING, // ORIGINAL 6% — commented; use SERVICE_FEE_* + computeTicketingServiceFee*
  SERVICE_FEE_BASE_CENTS,
  SERVICE_FEE_BASE_CAP_CENTS,
  SERVICE_FEE_RATE,
  computeTicketingServiceFeeCents,
  computeTicketingServiceFeeEur,
  TAX_RATE_RESERVATION,
};
