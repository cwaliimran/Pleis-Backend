const { GlobalChallengesOrders } = require("@GlobalChallengesOrdersModel");
const GlobalChallengeNotificationLogs = require("@GlobalChallengeNotificationLogsModel");
const { sendUserNotifications } = require("../../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const { getChallengeNotificationTitle } = require("../../../../helperUtils/challengeNotificationTitle");

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

      const snapshot = order.challengeSnapshot || {};
      const titlePayload = getChallengeNotificationTitle({
        ...snapshot,
        title: snapshot.title || snapshot.name,
      });

      await sendUserNotifications({
        recipientIds: [order.user.toString()],
        ...titlePayload,
        // Prefer structured titleKey; fall back to catalog key when no mapping/title
        ...(titlePayload.titleKey || titlePayload.title
          ? {}
          : { titleKey: "global_challenge_fallback_title" }),
        bodyKey: "global_challenge_expiring_soon_body",
        data: {
          type: NotificationTypes.GLOBAL_CHALLENGE_EXPIRING_SOON,
          objectType: "globalchallengeorders",
          challengeTitle: snapshot.name || snapshot.title,
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
