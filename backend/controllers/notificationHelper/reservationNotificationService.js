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
        objectType: "reservations",
      },
      sender: reservation.organizationId,
      objectId: reservationId,
      image: null, // You may extend with event/organization image later
    });

  } catch (err) {
    console.error("[RESERVATION_NOTIFICATION] Failed:", err);
  }
};

module.exports = { sendReservationNotification };
