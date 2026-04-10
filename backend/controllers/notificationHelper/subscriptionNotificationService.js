const { Events } = require("@EventsModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { sendUserNotifications } = require("../communicationController");
const { NotificationTypes } = require("../../models/Notifications");
const { subscriptionExpiryEmailTemplate, subscriptionExpiredEmailTemplate } = require("@utils/emailTemplates");
const { sendEmailViaMailgun } = require("@utils/emailUtil");
const formatDate = (dateString) => new Date(dateString).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/**
 * =====================================================
 * EVENT NOTIFICATION MAP
 * =====================================================
 */

const SUBSCRIPTION_NOTIFICATION_MAP = {
    SUBSCRIPTION_EXPIRED_10D: {
        type: NotificationTypes.SUBSCRIPTION_EXPIRED_10D,
        title: () => `Subscription Expiring Soon`,
        body: () => `Your subscription will expire in 10 days.`,
    },
    SUBSCRIPTION_EXPIRED_5D: {
        type: NotificationTypes.SUBSCRIPTION_EXPIRED_5D,
        title: () => `Subscription Expiring Soon`,
        body: () => `Your subscription will expire in 5 days.`,
    },
    SUBSCRIPTION_EXPIRED_1D: {
        type: NotificationTypes.SUBSCRIPTION_EXPIRED_1D,
        title: () => `Subscription Expiring Soon`,
        body: () => `Your subscription will expire in 1 day.`,
    },
    SUBSCRIPTION_EXPIRED_24H: {
        type: NotificationTypes.SUBSCRIPTION_EXPIRED_24H,
        title: () => `Subscription Expiring Soon`,
        body: () => `Your subscription will expire in 24 hours.`,
    },
    SUBSCRIPTION_EXPIRED: {
        type: NotificationTypes.SUBSCRIPTION_EXPIRED,
        title: () => `Subscription Expired`,
        body: () => `Your subscription has been Expired.`,
    },
};

/**
 * =====================================================
 * GENERIC EVENT NOTIFICATION DISPATCHER
 * =====================================================
 */
const sendSubscriptionNotification = async ({
    userId,
    action,
    userIds = [],
    context = {},
    username,
    expiryDate,
    email
}) => {
    try {
        if (!userId || !action) return;

        const config = SUBSCRIPTION_NOTIFICATION_MAP[action];
        if (!config) {
            console.warn(`[NOTIFICATION] Unknown action: ${action}`);
            return;
        }
console.log("action",action );
        // Send User Notifications
        await sendUserNotifications({
            recipientIds: userIds,
            title: config.title(context),
            body: config.body(context),
            data: {
                type: config.type,
                userId,
                objectType: "users",
            },
            sender: "system",
            objectId: userId,
            image: null,
        });

        const formattedExpiryDate = formatDate(expiryDate); // Format the expiry date

        // Prepare email body using the appropriate email template
        let mBody;
        if (action === "SUBSCRIPTION_EXPIRED") {
            mBody = subscriptionExpiredEmailTemplate({
                username,
                title: config.title(context),
                message: config.body(context),
            });
        } else {
            mBody = subscriptionExpiryEmailTemplate({
                username,
                expiryDate: formattedExpiryDate,
                title: config.title(context),
                message: config.body(context),
            });
        }

        // Send Email via Mailgun if not expired
        await sendEmailViaMailgun([email], config.title(context), mBody);

        console.log(
            `[NOTIFICATION] ${action} sent for user ${userId} to ${userIds.length} users`
        );
    } catch (err) {
        console.error("[NOTIFICATION] Failed:", err);
    }
};

    module.exports = { sendSubscriptionNotification };
