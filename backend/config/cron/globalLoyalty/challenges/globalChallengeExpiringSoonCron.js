const { GlobalChallengesOrders } = require("@GlobalChallengesOrdersModel");
const GlobalChallengeNotificationLogs = require("@GlobalChallengeNotificationLogsModel");
const { sendUserNotifications } = require("../../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");

const HOUR_MS = 60 * 60 * 1000;
const EXPIRING_WINDOW_HOURS = 24; // configurable

const runGlobalChallengeExpiringSoonCron = async () => {

  const now = new Date();
  const windowEnd = new Date(now.getTime() + EXPIRING_WINDOW_HOURS * HOUR_MS);

  try {

    const expiringOrders = await GlobalChallengesOrders.find({
      status: "in-progress",
      "challengeSnapshot.endDate": {
        $gte: now,
        $lte: windowEnd,
      },
    }).lean();


    for (const order of expiringOrders) {

      try {
        // 🔒 Idempotency Guard
        await GlobalChallengeNotificationLogs.create({
          globalChallengeOrderId: order._id,
          type: "GLOBAL_EXPIRING_SOON"
        });
      } catch (err) {
        // duplicate → already sent
        continue;
      }

      await sendUserNotifications({
        recipientIds: [order.user.toString()],
        title: order.challengeSnapshot?.name || "Global Challenge",
        body: "Your global challenge is expiring soon. Complete it before time runs out!",
        data: {
          type: NotificationTypes.GLOBAL_CHALLENGE_EXPIRING_SOON,
          objectType: "globalchallengeorders"
        },
        sender: null, // global system
        objectId: order.challenge
      });

    }

  } catch (err) {
    console.error("[GLOBAL_CHALLENGE_CRON] Failed:", err);
  }
};

module.exports = { runGlobalChallengeExpiringSoonCron };