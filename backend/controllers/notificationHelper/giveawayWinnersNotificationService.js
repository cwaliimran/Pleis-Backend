const { sendUserNotifications } = require("../communicationController");
const { NotificationTypes } = require("../../models/Notifications");
const { getFullImageUrl } = require("@utils/imageHelper");

/**
 * =====================================================
 * GIVEAWAY WINNER NOTIFICATION MAP
 * =====================================================
 */

const GIVEAWAY_NOTIFICATION_MAP = {
  GIVEAWAY_WINNER: {
    type: NotificationTypes.GIVEAWAY_WINNER,
    titleKey: "giveaway_winner_title",
    bodyKey: "giveaway_winner_body",
    titleValues: (event) => ({ giveawayTitle: event }),
    bodyValues: (event, ticket) => ({
      giveawayTitle: event,
      ticket,
    }),
  },
};

/**
 * =====================================================
 * GENERIC GIVEAWAY WINNER NOTIFICATION DISPATCHER
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

    await sendUserNotifications({
      recipientIds: userIds,
      titleKey: config.titleKey,
      bodyKey: config.bodyKey,
      titleValues: config.titleValues ? config.titleValues(event) : {},
      bodyValues: config.bodyValues ? config.bodyValues(event, ticket) : {},
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
