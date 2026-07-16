
const SubscriptionNotificationLogs = require("@SubscriptionNotificationLogsModel");

const { User } = require("@UsersModel");
const { sendSubscriptionNotification } = require("../../../controllers/notificationHelper/giveawayWinnersNotificationService");
const { activateInactiveSubscriptions } = require("./updateSubscription");

const MINUTE_MS = 60 * 1000;

const runSubscriptionReminderCron = async () => {
    const now = new Date();

    const windowStart = new Date(now.getTime() - MINUTE_MS);
    const windowEnd = new Date(now.getTime() + MINUTE_MS);

    try {
        // 10 days reminder
        await processReminder("10D", 10 * 24 * 60 * 60 * 1000, windowStart, windowEnd);

        // 5 days reminder
        await processReminder("5D", 5 * 24 * 60 * 60 * 1000, windowStart, windowEnd);


        // 24 hours reminder
        await processReminder("24H", 24 * 60 * 60 * 1000, windowStart, windowEnd);
        // expired
        await processReminder("EXPIRED", 24 * 60 * 60 * 1000, windowStart, windowEnd);

    } catch (err) {
        console.error("Event reminder cron failed:", err);
    }
};

const processReminder = async (type, offsetMs, windowStart, windowEnd) => {
    const targetStartLower = new Date(windowStart.getTime() + offsetMs);
    const targetStartUpper = new Date(windowEnd.getTime() + offsetMs);


    const subScriptions = await User.find({
        "accountState.status": "active",
        "accountState.userType": "organizer",
        "activeSubscription.endDate": {
            $gte: targetStartLower,
            $lte: targetStartUpper,
        },
    })
        .select("_id activeSubscription inActiveSubscription firstName lastName email")
        .lean();
    for (const subscription of subScriptions) {
        try {
            // idempotency guard
            await SubscriptionNotificationLogs.create({
                subscriptionId: subscription._id,
                type,
            });
        } catch (err) {
            // duplicate key → already sent
            continue;
        }
        const userIds = [subscription._id];
    
        if (!userIds.length) continue;
        let action;
        let context = {};
        if (type === "10D") {
            action = "SUBSCRIPTION_EXPIRED_10D";
        }
        if (type === "5D") {
            action = "SUBSCRIPTION_EXPIRED_5D";
        }
        if (type === "1D") {
            action = "SUBSCRIPTION_EXPIRED_1D";
        }

        if (type === "24H") {
            action = "SUBSCRIPTION_EXPIRED_24H";
        }
        if (type === "EXPIRED") {
          action = "SUBSCRIPTION_EXPIRED";

          await activateInactiveSubscriptions(subScriptions);
        }
        // sendSubscriptionNotification({
        //     userId: subscription._id,
        //     action,
        //     userIds,
        //     context,
        //     username: `${subscription.firstName} ${subscription.lastName}`,
        //     expiryDate: subscription.activeSubscription.endDate,
        //     email: subscription.email
        // }).catch(err =>
        //     console.error("Reminder notification failed:", err)
        // );
    }
};

module.exports = { runSubscriptionReminderCron };
