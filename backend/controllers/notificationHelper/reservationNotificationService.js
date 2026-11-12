const mongoose = require("mongoose");
const { UserReservations } = require("@UserReservationsModel");
const { sendUserNotifications } = require("../communicationController");
const { NotificationTypes } = require("../../models/Notifications");

/**
 * =====================================================
 * RESERVATION NOTIFICATION MAP
 * =====================================================
 * Guest notifications on reservation status changes follow Defects Report v1.5,
 * D-04 (Requirement Set #78). Every entry is stored and pushed with type
 * `reservationUpdate`, so it lands in the Reservations tab of the Notification
 * Center and opens Reservation Detail (objectId = reservation id). The specific
 * event travels in data.reservationAction.
 *
 * {venue} = the event title when the reservation is for an event, otherwise the
 * venue (organization) name.
 */

const RESERVATION_NOTIFICATION_MAP = {
  // Pending approval → Confirmed (free reservation confirmed by venue / auto-confirm)
  RESERVATION_APPROVED: {
    titleKey: "reservation_approved_title",
    bodyKey: "reservation_approved_body",
  },

  // Pending approval → Awaiting payment (minimum spend confirmed by venue)
  RESERVATION_DEPOSIT_REQUIRED: {
    titleKey: "reservation_deposit_required_title",
    bodyKey: (ctx) =>
      ctx.deadlineUnit === "minutes"
        ? "reservation_deposit_required_minutes_body"
        : "reservation_deposit_required_body",
  },

  // Awaiting payment → Confirmed (guest paid)
  RESERVATION_DEPOSIT_PAID: {
    titleKey: "reservation_deposit_paid_title",
    bodyKey: "reservation_deposit_paid_body",
  },

  // Awaiting payment → Cancelled (payment window passed)
  RESERVATION_EXPIRED: {
    titleKey: "reservation_expired_title",
    bodyKey: "reservation_expired_body",
  },

  // Pending approval → Rejected / Cancelled by the venue
  RESERVATION_DECLINED: {
    titleKey: "reservation_declined_title",
    bodyKey: "reservation_declined_body",
  },

  // Confirmed / Awaiting payment → Cancelled by the venue
  RESERVATION_CANCELLED_BY_VENUE: {
    titleKey: "reservation_cancelled_title",
    bodyKey: (ctx) =>
      ctx.refundAmount
        ? "reservation_cancelled_by_venue_refund_body"
        : "reservation_cancelled_by_venue_body",
  },

  // Confirmed → No-show (marked by staff)
  RESERVATION_NO_SHOW: {
    titleKey: "reservation_no_show_title",
    bodyKey: (ctx) =>
      ctx.voucherForfeited ? "reservation_no_show_forfeited_body" : "reservation_no_show_body",
  },

  // ----- kept for existing callers -----
  RESERVATION_CONFIRMED: {
    titleKey: "reservation_approved_title",
    bodyKey: "reservation_approved_body",
  },

  RESERVATION_CANCELLED: {
    titleKey: "reservation_cancelled_title",
    bodyKey: "reservation_cancelled_body",
  },

  RESERVATION_REJECTED: {
    titleKey: "reservation_declined_title",
    bodyKey: "reservation_declined_body",
  },

  RESERVATION_TIMING_CHANGED: {
    titleKey: "reservation_timing_changed_title",
    bodyKey: "reservation_timing_changed_body",
  },

  RESERVATION_STATUS_UPDATED: {
    titleKey: "reservation_status_updated_title",
    bodyKey: "reservation_status_updated_body",
  },
};

/**
 * D-04: which notification a status change produces. Returns null when the guest
 * gets none: their own actions (request, cancel) and Show (the guest is at the venue).
 *
 * @param {string} from previous status
 * @param {string} to new status
 * @param {{ byGuest?: boolean }} [opts]
 */
const resolveReservationTransitionAction = (from, to, { byGuest = false } = {}) => {
  if (!to || from === to || byGuest) return null;

  switch (to) {
    case "confirmed":
      return from === "pendingPayment" ? "RESERVATION_DEPOSIT_PAID" : "RESERVATION_APPROVED";
    case "pendingPayment":
      return "RESERVATION_DEPOSIT_REQUIRED";
    case "rejected":
      return "RESERVATION_DECLINED";
    case "cancelled":
      return from === "needsConfirmation" ? "RESERVATION_DECLINED" : "RESERVATION_CANCELLED_BY_VENUE";
    case "noShow":
      return "RESERVATION_NO_SHOW";
    case "checkedIn":
    case "needsConfirmation":
      return null;
    default:
      return "RESERVATION_STATUS_UPDATED";
  }
};

/** @deprecated use resolveReservationTransitionAction(from, to) */
const resolveReservationStatusAction = (status) =>
  resolveReservationTransitionAction(null, status) || "RESERVATION_STATUS_UPDATED";

// Payment window left, as a count + unit so each language words it itself.
const resolveDeadline = (lockUntil, now = new Date()) => {
  if (!lockUntil) return { deadlineCount: 24, deadlineUnit: "hours" };
  const minutes = Math.max(1, Math.round((new Date(lockUntil).getTime() - now.getTime()) / 60000));
  if (minutes < 60) return { deadlineCount: minutes, deadlineUnit: "minutes" };
  return { deadlineCount: Math.round(minutes / 60), deadlineUnit: "hours" };
};

const formatAmount = (value) => Number(value || 0).toFixed(2);

const resolveVenueLabel = async (reservation) => {
  const db = mongoose.connection;
  try {
    if (reservation.optionalEventId) {
      const event = await db
        .collection("events")
        .findOne({ _id: reservation.optionalEventId }, { projection: { title: 1 } });
      if (event?.title) return event.title;
    }
    if (reservation.organizationId) {
      const org = await db
        .collection("organizations")
        .findOne({ _id: reservation.organizationId }, { projection: { "basicInfo.name": 1 } });
      if (org?.basicInfo?.name) return org.basicInfo.name;
    }
  } catch (err) {
    console.warn("[RESERVATION_NOTIFICATION] venue lookup failed:", err?.message);
  }
  return "the venue";
};

/**
 * =====================================================
 * GENERIC RESERVATION NOTIFICATION DISPATCHER
 * =====================================================
 */

const sendReservationNotification = async ({
  reservationId,
  action,
  userIds = [],
  context = {},
}) => {
  try {
    if (!reservationId || !action) return;

    const config = RESERVATION_NOTIFICATION_MAP[action];
    if (!config) {
      console.warn(`[RESERVATION_NOTIFICATION] Unknown action: ${action}`);
      return;
    }

    const reservation = await UserReservations.findById(reservationId)
      .select(
        "userId organizationId optionalEventId partySize status amount lockUntil voucher paymentDetails",
      )
      .lean();

    if (!reservation) {
      console.warn(`[RESERVATION_NOTIFICATION] Not found: ${reservationId}`);
      return;
    }

    // Walk-in reservations may not have userId
    if (!userIds.length && reservation.userId) {
      userIds = [reservation.userId];
    }

    if (!userIds.length) {
      console.warn(`[RESERVATION_NOTIFICATION] No recipient for reservation ${reservationId}`);
      return;
    }

    const deadline = resolveDeadline(reservation.lockUntil);
    const ctx = {
      ...context,
      ...deadline,
      voucherForfeited:
        context.voucherForfeited ?? reservation.voucher?.status === "forfeited",
      refundAmount:
        context.refundAmount ??
        (reservation.paymentDetails?.paymentStatus === "refunded" &&
        Number(reservation.amount || 0) > 0
          ? formatAmount(reservation.amount)
          : null),
    };

    const bodyValues = {
      venue: await resolveVenueLabel(reservation),
      partySize: reservation.partySize,
      count: deadline.deadlineCount,
      amount: ctx.refundAmount || formatAmount(reservation.amount),
      newTiming: ctx.newTiming || "",
      status: ctx.status || reservation.status || "",
    };

    const bodyKey = typeof config.bodyKey === "function" ? config.bodyKey(ctx) : config.bodyKey;

    await sendUserNotifications({
      recipientIds: userIds,
      titleKey: config.titleKey,
      bodyKey,
      bodyValues,
      data: {
        type: NotificationTypes.RESERVATION_UPDATE,
        reservationAction: action,
        reservationId,
        status: reservation.status,
        objectType: "userreservations",
      },
      sender: reservation.organizationId,
      objectId: reservationId,
      image: null,
    });
  } catch (err) {
    console.error("[RESERVATION_NOTIFICATION] Failed:", err);
  }
};

module.exports = {
  sendReservationNotification,
  resolveReservationStatusAction,
  resolveReservationTransitionAction,
};
