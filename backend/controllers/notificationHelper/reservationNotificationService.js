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
    title: () => `Reservation Confirmed`,
    body: (reservation) =>
      `Your reservation for ${reservation.partySize} guest(s) has been confirmed.`,
  },

  RESERVATION_CANCELLED: {
    type: NotificationTypes.RESERVATION_CANCELLED,
    title: () => `Reservation Cancelled`,
    body: () =>
      `Your reservation has been cancelled.`,
  },

  RESERVATION_REJECTED: {
    type: NotificationTypes.RESERVATION_REJECTED,
    title: () => `Reservation Rejected`,
    body: () =>
      `Unfortunately, your reservation request was rejected.`,
  },

  RESERVATION_TIMING_CHANGED: {
    type: NotificationTypes.RESERVATION_TIMING_CHANGED,
    title: () => `Reservation Time Updated`,
    body: (reservation, context) =>
      `Your reservation timing has changed to ${context.newTiming}.`,
  },

  RESERVATION_CHECKED_IN: {
    type: NotificationTypes.RESERVATION_CHECKED_IN,
    title: () => `Checked In`,
    body: () =>
      `You have successfully checked in. Enjoy your visit!`,
  },

  RESERVATION_COMPLETED: {
    type: NotificationTypes.RESERVATION_COMPLETED,
    title: () => `Reservation Completed`,
    body: () =>
      `Thank you for visiting. We hope to see you again!`,
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
      title: config.title(reservation, context),
      body: config.body(reservation, context),
      data: {
        type: config.type,
        reservationId,
        objectType: "reservations",
      },
      sender: reservation.organizationId,
      objectId: reservationId,
      image: null, // You may extend with event/organization image later
    });

    console.log(
      `[RESERVATION_NOTIFICATION] ${action} sent for reservation ${reservationId}`
    );
  } catch (err) {
    console.error("[RESERVATION_NOTIFICATION] Failed:", err);
  }
};

module.exports = { sendReservationNotification };
