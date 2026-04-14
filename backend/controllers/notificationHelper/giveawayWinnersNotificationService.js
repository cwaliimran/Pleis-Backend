const { sendUserNotifications } = require("../communicationController");
const { NotificationTypes } = require("../../models/Notifications");
const { getFullImageUrl } = require("@utils/imageHelper");

/**
 * =====================================================
 * EVENT NOTIFICATION MAP
 * =====================================================
 */

const GIVEAWAY_NOTIFICATION_MAP = {
  GIVEAWAY_WINNER: {
    type: NotificationTypes.GIVEAWAY_WINNER,
    title: (event) => `Congratulations! You won the ${event} giveaway!`,
    body: (event, ticket) =>
      `You have won the giveaway for a ${ticket} at the ${event}. Enjoy your prize!`,
  },
};

/**
 * =====================================================
 * GENERIC EVENT NOTIFICATION DISPATCHER
 * =====================================================
 */
const giveawayWinnersNotificationService = async ({
  userIds = [],
  event,
  ticket,
  action,
  eventId,
  image,
}) => {
  try {
    if (!action) return;

    const config = GIVEAWAY_NOTIFICATION_MAP[action];
    if (!config) {
      console.warn(`[NOTIFICATION] Unknown action: ${action}`);
      return;
    }

    // Construct title and body using event and ticket information
    const title = config.title(event);
    const body = config.body(event, ticket);

    await sendUserNotifications({
      recipientIds: userIds,
      title,
      body,
      data: {
        type: config.type,
        event,
        ticket,
        objectType: "users",
      },
      sender: null,
      objectId: eventId,
      image: getFullImageUrl(image || "noimage.png"), // Ensure image is included if available
    });

  } catch (err) {
    console.error("[NOTIFICATION] Failed:", err);
  }
};

module.exports = { giveawayWinnersNotificationService };