/**
 * Reservation lifecycle (Requirement Set #54, #55, #92, #93; Defects Report D-02;
 * Reservations prototype v3.2 "Status transitions" and "Check-in and no-show").
 *
 *   Need confirmation → Confirmed (free) | Awaiting payment (minimum spend) | Rejected | Cancelled
 *   Awaiting payment  → Cancelled                 (Confirmed only by the system on payment capture)
 *   Confirmed         → Checked in (Show) | No-show | Cancelled
 *
 * Rejected, Cancelled, Checked in and No-show are final. Completed is no longer part
 * of the lifecycle (#54) and is never set.
 *
 * These rules apply to manual status changes by organizer, admin and staff.
 * System transitions (payment capture, payment failure) are handled by their own flows.
 */

const { getReservationStartTime } = require("../../app/reservations/cancellationPolicy");

const STATUS = Object.freeze({
  NEEDS_CONFIRMATION: "needsConfirmation",
  PENDING_PAYMENT: "pendingPayment",
  CONFIRMED: "confirmed",
  CHECKED_IN: "checkedIn",
  NO_SHOW: "noShow",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

/** Manual transitions allowed from each open status. */
const MANUAL_TRANSITIONS = Object.freeze({
  [STATUS.NEEDS_CONFIRMATION]: [
    STATUS.CONFIRMED,
    STATUS.PENDING_PAYMENT,
    STATUS.REJECTED,
    STATUS.CANCELLED,
  ],
  [STATUS.PENDING_PAYMENT]: [STATUS.CANCELLED],
  [STATUS.CONFIRMED]: [STATUS.CHECKED_IN, STATUS.NO_SHOW, STATUS.CANCELLED],
});

/** Statuses that end a reservation; nothing can be reached from them. */
const FINAL_STATUSES = Object.freeze([
  STATUS.REJECTED,
  STATUS.CANCELLED,
  STATUS.CHECKED_IN,
  STATUS.NO_SHOW,
  "completed",
  "deleted",
]);

const NO_SHOW_GRACE_OPTIONS = Object.freeze([15, 30, 45, 60]);
const DEFAULT_NO_SHOW_GRACE_MINUTES = 30;

const isMinimumSpend = (reservation) => Number(reservation?.amount || 0) > 0;

const resolveGraceMinutes = (preferences) => {
  const grace = Number(preferences?.noShowPolicy?.gracePeriodMinutes);
  return NO_SHOW_GRACE_OPTIONS.includes(grace) ? grace : DEFAULT_NO_SHOW_GRACE_MINUTES;
};

/**
 * #93: No-show can be marked only from slot start + grace period onwards.
 * Returns the earliest moment, or null when the reservation has no start time.
 */
const getNoShowAvailableAt = (reservation, graceMinutes = DEFAULT_NO_SHOW_GRACE_MINUTES) => {
  const start = getReservationStartTime(reservation);
  if (!start) return null;
  return new Date(start.getTime() + graceMinutes * 60 * 1000);
};

/**
 * Validates a manual status change.
 * @returns {{ ok: true } | { ok: false, statusCode: number, translationKey: string, values?: object }}
 */
const validateManualTransition = ({ reservation, nextStatus, graceMinutes, now = new Date() }) => {
  const current = reservation?.status;

  if (current === nextStatus) {
    return { ok: false, statusCode: 409, translationKey: "reservation_status_unchanged" };
  }

  if (FINAL_STATUSES.includes(current)) {
    return { ok: false, statusCode: 409, translationKey: "reservation_status_final" };
  }

  const allowed = MANUAL_TRANSITIONS[current] || [];
  if (!allowed.includes(nextStatus)) {
    return {
      ok: false,
      statusCode: 409,
      translationKey: "reservation_status_transition_not_allowed",
    };
  }

  if (nextStatus === STATUS.NO_SHOW) {
    const availableAt = getNoShowAvailableAt(reservation, graceMinutes);
    if (!availableAt || now < availableAt) {
      return {
        ok: false,
        statusCode: 409,
        translationKey: "reservation_no_show_too_early",
        values: { availableAt: availableAt ? availableAt.toISOString() : null },
      };
    }
  }

  return { ok: true };
};

/**
 * Extra fields to $set when the status changes: Show / No-show audit (IAO-34)
 * and the forfeited voucher on a minimum spend no-show (#55).
 */
const buildStatusSideEffects = ({ reservation, nextStatus, actorId = null, via, now = new Date() }) => {
  const set = {};
  const venue = reservation?.organizationId || null;

  if (nextStatus === STATUS.CHECKED_IN) {
    set.checkInRecord = { at: now, by: actorId, venue, via: via || "staff" };
  }

  if (nextStatus === STATUS.NO_SHOW) {
    set.noShowRecord = { at: now, by: actorId, venue, via: via || "staff" };
    // The prepaid minimum spend stays with the organizer; nothing is refunded.
    if (isMinimumSpend(reservation) && reservation?.voucher?.status === "pending") {
      set["voucher.status"] = "forfeited";
    }
  }

  return set;
};

module.exports = {
  STATUS,
  MANUAL_TRANSITIONS,
  FINAL_STATUSES,
  NO_SHOW_GRACE_OPTIONS,
  DEFAULT_NO_SHOW_GRACE_MINUTES,
  isMinimumSpend,
  resolveGraceMinutes,
  getNoShowAvailableAt,
  validateManualTransition,
  buildStatusSideEffects,
};
