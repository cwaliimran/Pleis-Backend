const { UserReservations } = require("@UserReservationsModel");
const { sendUserNotifications } = require("../communicationController");
const { NotificationTypes } = require("../../models/Notifications");

/**
 * =====================================================
 * RESERVATION NOTIFICATION MAP
 * =====================================================
 */

const RESERVATION_NOTIFICATION_MAP = {
  RESERVATION_CONFIRMED: {
    type: NotificationTypes.RESERVATION_CONFIRMED,
    titleKey: "reservation_confirmed_title",
    bodyKey: "reservation_confirmed_body",
    bodyValues: (reservation) => ({ partySize: reservation.partySize }),
  },

  RESERVATION_CANCELLED: {
    type: NotificationTypes.RESERVATION_CANCELLED,
    titleKey: "reservation_cancelled_title",
    bodyKey: "reservation_cancelled_body",
  },

  RESERVATION_REJECTED: {
    type: NotificationTypes.RESERVATION_REJECTED,
    titleKey: "reservation_rejected_title",
    bodyKey: "reservation_rejected_body",
  },

  RESERVATION_TIMING_CHANGED: {
    type: NotificationTypes.RESERVATION_TIMING_CHANGED,
    titleKey: "reservation_timing_changed_title",
    bodyKey: "reservation_timing_changed_body",
    bodyValues: (_reservation, context) => ({ newTiming: context.newTiming }),
  },

  RESERVATION_CHECKED_IN: {
    type: NotificationTypes.RESERVATION_CHECKED_IN,
    titleKey: "reservation_checked_in_title",
    bodyKey: "reservation_checked_in_body",
  },

  RESERVATION_COMPLETED: {
    type: NotificationTypes.RESERVATION_COMPLETED,
    titleKey: "reservation_completed_title",
    bodyKey: "reservation_completed_body",
  },

  RESERVATION_PENDING_PAYMENT: {
    type: NotificationTypes.RESERVATION_PENDING_PAYMENT,
    titleKey: "reservation_pending_payment_title",
    bodyKey: "reservation_pending_payment_body",
  },

  RESERVATION_NEEDS_CONFIRMATION: {
    type: NotificationTypes.RESERVATION_NEEDS_CONFIRMATION,
    titleKey: "reservation_needs_confirmation_title",
    bodyKey: "reservation_needs_confirmation_body",
  },

  RESERVATION_STATUS_UPDATED: {
    type: NotificationTypes.RESERVATION_STATUS_UPDATED,
    titleKey: "reservation_status_updated_title",
    bodyKey: "reservation_status_updated_body",
    bodyValues: (_reservation, context) => ({ status: context.status || "" }),
  },
};

const STATUS_TO_NOTIFICATION_ACTION = {
  confirmed: "RESERVATION_CONFIRMED",
  cancelled: "RESERVATION_CANCELLED",
  rejected: "RESERVATION_REJECTED",
  checkedIn: "RESERVATION_CHECKED_IN",
  completed: "RESERVATION_COMPLETED",
  pendingPayment: "RESERVATION_PENDING_PAYMENT",
  needsConfirmation: "RESERVATION_NEEDS_CONFIRMATION",
};

const resolveReservationStatusAction = (status) =>
  STATUS_TO_NOTIFICATION_ACTION[status] || "RESERVATION_STATUS_UPDATED";



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
      .select("userId organizationId partySize status")
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

    await sendUserNotifications({
      recipientIds: userIds,
      titleKey: config.titleKey,
      bodyKey: config.bodyKey,
      bodyValues: config.bodyValues
        ? config.bodyValues(reservation, context)
        : {},
      data: {
        type: config.type,
        reservationId,
        objectType: "userreservations",
      },
      sender: reservation.organizationId,
      objectId: reservationId,
      image: null, // You may extend with event/organization image later
    });

  } catch (err) {
    console.error("[RESERVATION_NOTIFICATION] Failed:", err);
  }
};

module.exports = {
  sendReservationNotification,
  resolveReservationStatusAction,
};
