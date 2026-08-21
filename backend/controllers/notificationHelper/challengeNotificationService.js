const { LoyaltyChallengesOrders } = require("@LoyaltyChallengesOrdersModel");
const { sendUserNotifications } = require("../communicationController");
const { NotificationTypes } = require("@NotificationsModel");

/**
 * =====================================================
 * CHALLENGE NOTIFICATION MAP
 * =====================================================
 */

const CHALLENGE_NOTIFICATION_MAP = {

  CHALLENGE_STARTED: {
    type: NotificationTypes.CHALLENGE_STARTED,
    title: (challenge) => `${challenge.title}`,
    body: () => `Your challenge has started. Start progressing now!`,
  },

  CHALLENGE_PROGRESS_MILESTONE: {
    type: NotificationTypes.CHALLENGE_PROGRESS_MILESTONE,
    title: (challenge) => `${challenge.title}`,
    body: (_, context) =>
      `Great progress! You've reached ${context.percentage}% of your challenge.`,
  },

  CHALLENGE_COMPLETED: {
    type: NotificationTypes.CHALLENGE_COMPLETED,
    title: (challenge) => `${challenge.title}`,
    body: () =>
      `Congratulations! You've successfully completed this challenge.`,
  },

  CHALLENGE_REWARD_UNLOCKED: {
    type: NotificationTypes.CHALLENGE_REWARD_UNLOCKED,
    title: (challenge) => `${challenge.title}`,
    body: () =>
      `Your reward has been unlocked. Claim it now!`,
  },

  CHALLENGE_EXPIRING_SOON: {
    type: NotificationTypes.CHALLENGE_EXPIRING_SOON,
    title: (challenge) => `${challenge.title}`,
    body: () =>
      `Hurry! Your challenge is expiring soon.`,
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

    const challenge = order.challengeSnapshot;

    if (!userIds.length && order.user) {
      userIds = [order.user];
    }

    if (!userIds.length) return;

    await sendUserNotifications({
      recipientIds: userIds,
      title: config.title(challenge, context),
      body: config.body(challenge, context),
      data: {
        type: config.type,
        challengeOrderId,
        objectType: "challenges",
      },
      sender: order.companyOrganizer,
      objectId: challenge._id,
      image: null,
    });


  } catch (err) {
    console.error("[CHALLENGE_NOTIFICATION] Failed:", err);
  }
};

module.exports = { sendChallengeNotification };