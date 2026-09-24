/**
 * Shared cancellation eligibility for app cancel API + reservation detail.
 *
 * Rules (aligned with mobile):
 * - Policy disabled / missing → cannot cancel
 * - Policy enabled with hoursBeforeReservation N → cancel only when
 *   now is more than N hours before first slot startTime
 *   (N === 0 → anytime before start)
 * - Terminal / non-cancellable statuses → cannot cancel
 */

const NON_CANCELLABLE_STATUSES = new Set([
  "cancelled",
  "rejected",
  "completed",
  "checkedIn",
  "deleted",
]);

/**
 * First slot start from raw (unformatted) timingSlots.
 * @param {object} reservation
 * @returns {Date|null}
 */
const getReservationStartTime = (reservation) => {
  const dateTimeSlots = reservation?.timingSlots?.dateTimeSlots;
  if (Array.isArray(dateTimeSlots) && dateTimeSlots.length > 0) {
    const first = dateTimeSlots[0];
    const timeSlots = first?.timeSlots;
    if (Array.isArray(timeSlots) && timeSlots[0]?.startTime) {
      const start = new Date(timeSlots[0].startTime);
      return Number.isNaN(start.getTime()) ? null : start;
    }
    if (first?.date) {
      const start = new Date(first.date);
      return Number.isNaN(start.getTime()) ? null : start;
    }
  }

  // Flattened shape (rare on raw docs; used if already formatted)
  if (reservation?.timingSlots?.startTime) {
    const flat = reservation.timingSlots.startTime;
    if (flat instanceof Date || (typeof flat === "string" && !Number.isNaN(Date.parse(flat)))) {
      const start = new Date(flat);
      return Number.isNaN(start.getTime()) ? null : start;
    }
  }

  return null;
};

/**
 * @param {object} reservation - user reservation (raw timing preferred)
 * @param {object|null|undefined} cancellationPolicy - { status, hoursBeforeReservation }
 * @param {Date} [now]
 * @returns {{ canCancel: boolean, reason: string|null, hoursBeforeReservation: number, policyEnabled: boolean }}
 */
const evaluateCancellationEligibility = (reservation, cancellationPolicy, now = new Date()) => {
  const hoursBeforeReservation = Number(cancellationPolicy?.hoursBeforeReservation) || 0;
  const policyEnabled = cancellationPolicy?.status === "enabled";

  const status = reservation?.status != null ? String(reservation.status).trim() : null;
  if (status && NON_CANCELLABLE_STATUSES.has(status)) {
    return {
      canCancel: false,
      reason: `Reservation cannot be cancelled when status is ${status}.`,
      hoursBeforeReservation,
      policyEnabled,
    };
  }

  if (!policyEnabled) {
    return {
      canCancel: false,
      reason: "Cancellation is not available for this venue.",
      hoursBeforeReservation,
      policyEnabled: false,
    };
  }

  const start = getReservationStartTime(reservation);
  if (!start) {
    return {
      canCancel: false,
      reason: "Reservation start time is unavailable; cancellation is not allowed.",
      hoursBeforeReservation,
      policyEnabled,
    };
  }

  if (now.getTime() >= start.getTime()) {
    return {
      canCancel: false,
      reason: "Reservation has already started and can no longer be cancelled.",
      hoursBeforeReservation,
      policyEnabled,
    };
  }

  const msBeforeRequired = hoursBeforeReservation * 60 * 60 * 1000;
  const deadline = new Date(start.getTime() - msBeforeRequired);

  // can cancel only when current time is strictly before the deadline
  // (more than N hours before start; if N=0, anytime before start)
  if (now.getTime() >= deadline.getTime()) {
    return {
      canCancel: false,
      reason:
        hoursBeforeReservation > 0
          ? `Cancellation must be at least ${hoursBeforeReservation} hours before the reservation.`
          : "Reservation can no longer be cancelled.",
      hoursBeforeReservation,
      policyEnabled,
    };
  }

  return {
    canCancel: true,
    reason: null,
    hoursBeforeReservation,
    policyEnabled,
  };
};

module.exports = {
  NON_CANCELLABLE_STATUSES,
  getReservationStartTime,
  evaluateCancellationEligibility,
};
