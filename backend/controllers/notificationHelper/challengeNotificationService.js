const { LoyaltyChallengesOrders } = require("@LoyaltyChallengesOrdersModel");
const { sendUserNotifications } = require("../communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const { getChallengeNotificationTitle } = require("../../helperUtils/challengeNotificationTitle");

/**
 * =====================================================
 * CHALLENGE NOTIFICATION MAP
 * =====================================================
 */

const CHALLENGE_NOTIFICATION_MAP = {

  CHALLENGE_STARTED: {
    type: NotificationTypes.CHALLENGE_STARTED,
    bodyKey: "challenge_helper_started_body",
  },

  CHALLENGE_PROGRESS_MILESTONE: {
    type: NotificationTypes.CHALLENGE_PROGRESS_MILESTONE,
    bodyKey: "challenge_helper_milestone_body",
    bodyValues: (_, context) => ({ percentage: context.percentage }),
  },

  CHALLENGE_COMPLETED: {
    type: NotificationTypes.CHALLENGE_COMPLETED,
    bodyKey: "challenge_helper_completed_body",
  },

  CHALLENGE_REWARD_UNLOCKED: {
    type: NotificationTypes.CHALLENGE_REWARD_UNLOCKED,
    bodyKey: "challenge_helper_reward_unlocked_body",
  },

  CHALLENGE_EXPIRING_SOON: {
    type: NotificationTypes.CHALLENGE_EXPIRING_SOON,
    bodyKey: "challenge_helper_expiring_soon_body",
  },
};


/**
 * =====================================================
 * GENERIC CHALLENGE NOTIFICATION DISPATCHER
 * =====================================================
 */

const sendChallengeNotification = async ({
  challengeOrderId,
  action,
  userIds = [],
  context = {},
}) => {
  try {
    if (!challengeOrderId || !action) return;

    const config = CHALLENGE_NOTIFICATION_MAP[action];
    if (!config) {
      console.warn(`[CHALLENGE_NOTIFICATION] Unknown action: ${action}`);
      return;
    }

    const order = await LoyaltyChallengesOrders.findById(challengeOrderId)
      .select("user challengeSnapshot companyOrganizer")
      .lean();

    if (!order) {
      console.warn(`[CHALLENGE_NOTIFICATION] Not found: ${challengeOrderId}`);
      return;
    }

    const challenge = order.challengeSnapshot || {};

    if (!userIds.length && order.user) {
      userIds = [order.user];
    }

    if (!userIds.length) return;

    await sendUserNotifications({
      recipientIds: userIds,
      ...getChallengeNotificationTitle(challenge),
      bodyKey: config.bodyKey,
      bodyValues: config.bodyValues
        ? config.bodyValues(challenge, context)
        : {},
      data: {
        type: config.type,
        challengeOrderId,
        objectType: "challenges",
      },
      sender: order.companyOrganizer,
      objectId: challenge._id || challengeOrderId,
      image: null,
    });


  } catch (err) {
    console.error("[CHALLENGE_NOTIFICATION] Failed:", err);
  }
};

module.exports = { sendChallengeNotification };
