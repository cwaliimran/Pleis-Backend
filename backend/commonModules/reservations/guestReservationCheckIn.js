/**
 * Guest check-in in the app (Q&A #10): when the guest checks in at a venue
 * (geofenced button or the venue QR), their Confirmed reservation there for
 * around now becomes Checked in (Show), the same as a staff check-in.
 *
 * Goes through changeReservationStatus, so the lifecycle holds (only Confirmed
 * → Checked in), the check-in is recorded with via "guest" and the guest gets
 * the usual notification. Anything else (no reservation, already final, not
 * yet in the window) leaves reservations untouched.
 */
const { UserReservations } = require("@UserReservationsModel");
const { getReservationStartTime } = require("../../app/reservations/cancellationPolicy");
const { changeReservationStatus } = require("./reservationStatusService");

/** A check-in counts from 2 h before the reservation start until 4 h after it. */
const EARLY_MS = 2 * 60 * 60 * 1000;
const LATE_MS = 4 * 60 * 60 * 1000;

/** @returns {Promise<object|null>} the checked-in reservation, or null */
async function checkInGuestReservation({ userId, organization, now = new Date() }) {
  if (!userId || !organization) return null;

  const confirmed = await UserReservations.find({
    userId,
    organizationId: organization,
    status: "confirmed",
  })
    .select("timingSlots")
    .lean();

  let best = null;
  for (const reservation of confirmed) {
    const start = getReservationStartTime(reservation);
    if (!start) continue;
    const offset = now.getTime() - start.getTime(); // > 0: after the start
    if (offset < -EARLY_MS || offset > LATE_MS) continue;
    if (!best || Math.abs(offset) < Math.abs(best.offset)) best = { reservation, offset };
  }
  if (!best) return null;

  const result = await changeReservationStatus({
    id: best.reservation._id,
    status: "checkedIn",
    actorId: userId,
    via: "guest",
    reason: "Checked in by the guest in the app",
  });
  return result.ok ? result.reservation : null;
}

module.exports = { checkInGuestReservation, EARLY_MS, LATE_MS };
