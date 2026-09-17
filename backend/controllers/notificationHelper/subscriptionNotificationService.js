const { subscriptionExpiryEmailTemplate, subscriptionExpiredEmailTemplate } = require("@utils/emailTemplates");
const { sendEmailViaMailgun } = require("@utils/emailUtil");
const { translateNotification } = require("../../helperUtils/notificationTranslationUtil");
const formatDate = (dateString) => new Date(dateString).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/**
 * =====================================================
 * SUBSCRIPTION NOTIFICATION MAP
 * =====================================================
 */

const SUBSCRIPTION_NOTIFICATION_MAP = {
    SUBSCRIPTION_EXPIRED_10D: {
        titleKey: "subscription_expiring_soon_title",
        bodyKey: "subscription_expiring_10d_body",
    },
    SUBSCRIPTION_EXPIRED_5D: {
        titleKey: "subscription_expiring_soon_title",
        bodyKey: "subscription_expiring_5d_body",
    },
    SUBSCRIPTION_EXPIRED_1D: {
        titleKey: "subscription_expiring_soon_title",
        bodyKey: "subscription_expiring_1d_body",
    },
    SUBSCRIPTION_EXPIRED_24H: {
        titleKey: "subscription_expiring_soon_title",
        bodyKey: "subscription_expiring_24h_body",
    },
    SUBSCRIPTION_EXPIRED: {
        titleKey: "subscription_expired_title",
        bodyKey: "subscription_expired_body",
    },
};

/**
 * =====================================================
 * GENERIC SUBSCRIPTION NOTIFICATION DISPATCHER
 * =====================================================
 */
const sendSubscriptionNotification = async ({
    userId,
    action,
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

        const formattedExpiryDate = formatDate(expiryDate);

        // Keep email copy in English to minimize scope
        const emailTitle = translateNotification(config.titleKey, { language: "en" });
        const emailMessage = translateNotification(config.bodyKey, { language: "en" });

        let mBody;
        if (action === "SUBSCRIPTION_EXPIRED") {
            mBody = subscriptionExpiredEmailTemplate({
                username,
                title: emailTitle,
                message: emailMessage,
            });
        } else {
            mBody = subscriptionExpiryEmailTemplate({
                username,
                expiryDate: formattedExpiryDate,
                title: emailTitle,
                message: emailMessage,
            });
        }

        await sendEmailViaMailgun([email], emailTitle, mBody);

    } catch (err) {
        console.error("[NOTIFICATION] Failed:", err);
    }
};

module.exports = { sendSubscriptionNotification };
