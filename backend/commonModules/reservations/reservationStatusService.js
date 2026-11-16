/**
 * One entry point for manual reservation status changes from the admin panel
 * (organizer / super admin) and the staff app. Enforces the lifecycle
 * (reservationLifecycle.js), records who / when / venue for Show and No-show,
 * forfeits the minimum spend voucher on No-show and sends the D-04 guest
 * notification.
 */

const mongoose = require("mongoose");
const { UserReservations } = require("@UserReservationsModel");
const ReservationPreferences = require("@ReservationPreferencesModel");
const { fireAndForget } = require("../../helperUtils/responseUtil");
const {
  STATUS,
  isMinimumSpend,
  resolveGraceMinutes,
  validateManualTransition,
  buildStatusSideEffects,
} = require("./reservationLifecycle");
const {
  sendReservationNotification,
  resolveReservationTransitionAction,
} = require("../../controllers/notificationHelper/reservationNotificationService");

const PAYMENT_HOLD_MS = 30 * 60 * 1000;

const STATUS_REASON = {
  [STATUS.CONFIRMED]: "Confirmed by staff",
  [STATUS.PENDING_PAYMENT]: "Confirmed by staff · waiting for payment",
  [STATUS.REJECTED]: "Rejected by staff",
  [STATUS.CANCELLED]: "Cancelled by staff",
  [STATUS.CHECKED_IN]: "Checked in by staff",
  [STATUS.NO_SHOW]: "Marked as no-show by staff",
};

const recordEventCheckins = async (reservation, now) => {
  const { getActiveEventsForOrg } = require("../../admin/events/eventRepository");
  const { EventCheckins } = require("../events/EventCheckinsModel");

  if (!reservation.userId) return;

  const events = reservation.optionalEventId
    ? [{ _id: reservation.optionalEventId, companyOrganizer: reservation.companyOrganizer }]
    : await getActiveEventsForOrg(reservation.organizationId, now);

  if (!events.length) return;

  await EventCheckins.bulkWrite(
    events.map((event) => ({
      updateOne: {
        filter: { event: event._id, user: reservation.userId },
        update: {
          $setOnInsert: {
            organization: reservation.organizationId,
            companyOrganizer: event.companyOrganizer,
            source: "reservation",
            checkedInAt: now,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
};

/**
 * @param {object} args
 * @param {string} args.id               UserReservations _id
 * @param {string} args.status           requested status
 * @param {string} [args.actorId]        user who acts (null = system)
 * @param {"admin"|"staff"|"scan"} [args.via]
 * @param {string} [args.companyOrganizer] when set, the reservation must belong to this organizer
 * @param {string[]} [args.organizationIds] when set, the reservation's venue must be one of these (staff)
 * @param {string} [args.reason]
 * @returns {Promise<{ ok: true, reservation: object } | { ok: false, statusCode: number, translationKey: string, values?: object }>}
 */
const changeReservationStatus = async ({
  id,
  status,
  actorId = null,
  via = "admin",
  companyOrganizer = null,
  organizationIds = null,
  reason,
}) => {
  const now = new Date();

  const existing = await UserReservations.findById(id).lean();
  if (!existing || existing.status === "deleted") {
    return { ok: false, statusCode: 404, translationKey: "Reservation_not_found" };
  }

  if (companyOrganizer && String(existing.companyOrganizer) !== String(companyOrganizer)) {
    return { ok: false, statusCode: 404, translationKey: "Reservation_not_found" };
  }
  if (Array.isArray(organizationIds) && !organizationIds.includes(String(existing.organizationId))) {
    return { ok: false, statusCode: 404, translationKey: "Reservation_not_found" };
  }

  // Confirming a minimum spend request starts the payment step (prototype v3.2).
  let nextStatus = status;
  if (
    status === STATUS.CONFIRMED &&
    existing.status === STATUS.NEEDS_CONFIRMATION &&
    isMinimumSpend(existing)
  ) {
    nextStatus = STATUS.PENDING_PAYMENT;
  }
  // A free reservation never waits for payment.
  if (nextStatus === STATUS.PENDING_PAYMENT && !isMinimumSpend(existing)) {
    nextStatus = STATUS.CONFIRMED;
  }

  let graceMinutes;
  if (nextStatus === STATUS.NO_SHOW) {
    const prefs = await ReservationPreferences.findOne({ organization: existing.organizationId })
      .select("noShowPolicy")
      .lean();
    graceMinutes = resolveGraceMinutes(prefs);
  }

  const check = validateManualTransition({
    reservation: existing,
    nextStatus,
    graceMinutes,
    now,
  });
  if (!check.ok) return check;

  const actor = actorId ? new mongoose.Types.ObjectId(String(actorId)) : null;

  const $set = {
    status: nextStatus,
    ...buildStatusSideEffects({ reservation: existing, nextStatus, actorId: actor, via, now }),
  };
  if (nextStatus === STATUS.PENDING_PAYMENT) {
    $set.lockUntil = new Date(now.getTime() + PAYMENT_HOLD_MS);
  }

  // Optimistic guard: only apply if nobody changed the status in between.
  const updated = await UserReservations.findOneAndUpdate(
    { _id: existing._id, status: existing.status },
    {
      $set,
      $push: {
        reservationChanges: {
          changedBy: actor,
          action: "reservationStatusChanged",
          oldValue: existing.status,
          newValue: nextStatus,
          reason: reason || STATUS_REASON[nextStatus] || "Reservation status updated",
          createdAt: now,
        },
      },
    },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) {
    return { ok: false, statusCode: 409, translationKey: "reservation_status_transition_not_allowed" };
  }

  if (nextStatus === STATUS.CONFIRMED) {
    const {
      maybeSendFreeReservationConfirmation,
    } = require("../../helperUtils/plainConfirmationEmailService");
    fireAndForget(
      maybeSendFreeReservationConfirmation(updated._id),
      "PLAIN_FREE_RESERVATION_CONFIRMATION",
    );
  }

  if (nextStatus === STATUS.CHECKED_IN) {
    fireAndForget(recordEventCheckins(updated, now), "RESERVATION_EVENT_CHECKIN");
  }

  const action = resolveReservationTransitionAction(existing.status, nextStatus);
  if (updated.userId && action) {
    fireAndForget(
      sendReservationNotification({
        reservationId: updated._id,
        action,
        context: {
          status: nextStatus,
          voucherForfeited: updated.voucher?.status === "forfeited",
        },
      }),
      `RESERVATION_${String(nextStatus).toUpperCase()}_NOTIFICATION`,
    );
  }

  return { ok: true, reservation: updated };
};

module.exports = { changeReservationStatus };
