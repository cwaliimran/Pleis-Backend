const mongoose = require("mongoose");
const { LoyaltyChallengesOrders } = require("@LoyaltyChallengesOrdersModel");
const LoyaltyChallengeNotificationLogsModel = require("@LoyaltyChallengeNotificationLogsModel");
const { sendUserNotifications } = require("../../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");

const HOUR_MS = 60 * 60 * 1000;

// How many hours before expiry to notify
const EXPIRING_WINDOW_HOURS = 24; // adjust as needed

const runLoyaltyChallengeExpiringSoonCron = async () => {

  const now = new Date();
  const windowEnd = new Date(now.getTime() + EXPIRING_WINDOW_HOURS * HOUR_MS);

  try {

    const expiringOrders = await LoyaltyChallengesOrders.find({
      status: "in-progress",
      "challengeSnapshot.endDate": {
        $gte: now,
        $lte: windowEnd,
      },
    }).lean();


    for (const order of expiringOrders) {

      try {
        // 🔒 Idempotency Guard
        await LoyaltyChallengeNotificationLogsModel.create({
          challengeOrderId: order._id,
          type: "EXPIRING_SOON"
        });
      } catch (err) {
        // Duplicate key → already notified
        continue;
      }

      await sendUserNotifications({
        recipientIds: [order.user.toString()],
        title: order.challengeSnapshot.title,
        body: "Your challenge is expiring soon. Complete it before time runs out!",
        data: {
          type: NotificationTypes.CHALLENGE_EXPIRING_SOON,
          objectType: "challengesorders"
        },
        sender: order.companyOrganizer,
        objectId: order._id
      });

    }

  } catch (err) {
    console.error("[CHALLENGE_CRON] Failed:", err);
  }
};

module.exports = { runLoyaltyChallengeExpiringSoonCron };