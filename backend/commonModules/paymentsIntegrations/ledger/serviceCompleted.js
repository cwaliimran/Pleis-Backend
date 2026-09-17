/**
 * Payout §2.2 service-completion predicates.
 *
 * Ticketing  — event has ended (schedule.endDateTime < now)
 * Ordering   — delivered + paid (maps to status "completed" + paymentStatus "paid";
 *              codebase has no DELIVERED enum — "completed" is the delivered state)
 * Reservation act — never a commissioned payout line (voucher spend pays via ordering)
 */

const ORDERING_DELIVERED_STATUSES = new Set(["completed"]);

function isTicketingServiceCompleted(eventOrEnd, now = new Date()) {
  const end =
    eventOrEnd?.schedule?.endDateTime != null
      ? eventOrEnd.schedule.endDateTime
      : eventOrEnd;
  if (!end) return false;
  const endAt = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(endAt.getTime())) return false;
  return endAt.getTime() < now.getTime();
}

function isOrderingServiceCompleted(order) {
  if (!order) return false;
  const paid =
    order.paymentStatus === "paid" ||
    order.paymentDetails?.paymentStatus === "paid";
  if (!paid) return false;
  return ORDERING_DELIVERED_STATUSES.has(String(order.status || ""));
}

/**
 * Reservation payment itself is never payout-selectable.
 * Min-spend voucher enters payout only when spent on ordering.
 */
function isReservationActPayoutEligible() {
  return false;
}

/**
 * High-level eligibility for statement selection (payoutStatus must still be PENDING).
 * Does not check organizer bank data (§2.3 / §5.3) — that is Phase B statement gate.
 */
function isServiceCompletedForLedger(entry, context = {}) {
  const module = entry?.module || context.module;
  if (module === "TICKETING") {
    return isTicketingServiceCompleted(context.event || context.eventEndAt);
  }
  if (module === "ORDERING") {
    return isOrderingServiceCompleted(context.order || entry);
  }
  if (module === "RESERVATION" || module === "SUBSCRIPTION") {
    return false;
  }
  return false;
}

module.exports = {
  ORDERING_DELIVERED_STATUSES,
  isTicketingServiceCompleted,
  isOrderingServiceCompleted,
  isReservationActPayoutEligible,
  isServiceCompletedForLedger,
};
