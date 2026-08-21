const { Events } = require("@EventsModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { sendUserNotifications } = require("../communicationController");
const { NotificationTypes } = require("../../models/Notifications");

/**
 * =====================================================
 * EVENT NOTIFICATION MAP
 * =====================================================
 */

const EVENT_NOTIFICATION_MAP = {
    TICKET_CONFIRMED: {
        type: NotificationTypes.TICKET_CONFIRMED,
        title: (event) => `Ticket confirmed for ${event.basicInfo.title}`,
        body: (event, context) =>
            `Your booking for ${context.ticketsPurchased || 0} ticket(s) is confirmed.`,
    },

    TICKET_CANCELLED: {
        type: NotificationTypes.TICKET_CANCELLED,
        title: (event) => `Ticket cancelled for ${event.basicInfo.title}`,
        body: () => `Your ticket has been cancelled.`,
    },

    EVENT_CANCELLED: {
        type: NotificationTypes.EVENT_CANCELLED,
        title: () => `Event Cancelled`,
        body: (event) =>
            `"${event.basicInfo.title}" has been cancelled.`,
    },

    EVENT_RESCHEDULED: {
        type: NotificationTypes.EVENT_RESCHEDULED,
        title: () => `Event Rescheduled`,
        body: (event, context) =>
            `"${event.basicInfo.title}" has been rescheduled to ${context.newDate}.`,
    },

    EVENT_STARTING_24H: {
        type: NotificationTypes.EVENT_STARTING_24H,
        title: () => `Starts in 24 hours`,
        body: (event) =>
            `"${event.basicInfo.title}" starts tomorrow.`,
    },

    EVENT_STARTING_2H: {
        type: NotificationTypes.EVENT_STARTING_2H,
        title: () => `Starts in 2 hours`,
        body: (event) =>
            `"${event.basicInfo.title}" starts soon.`,
    },

    EVENT_STARTED: {
        type: NotificationTypes.EVENT_STARTED,
        title: () => `Event is Live Now`,
        body: (event) =>
            `"${event.basicInfo.title}" has started.`,
    },
};

/**
 * =====================================================
 * GENERIC EVENT NOTIFICATION DISPATCHER
 * =====================================================
 */

const sendEventNotification = async ({
    eventId,
    action,
    userIds = [],
    context = {},
}) => {
    try {
        if (!eventId || !action) return;

        const config = EVENT_NOTIFICATION_MAP[action];
        if (!config) {
            console.warn(`[NOTIFICATION] Unknown action: ${action}`);
            return;
        }

        // Fetch event
        const event = await Events.findById(eventId)
            .select("basicInfo.title basicInfo.media basicInfo.organization")
            .lean();

        if (!event) {
            console.warn(`[NOTIFICATION] Event not found: ${eventId}`);
            return;
        }

        // If no recipients provided → fetch all valid ticket holders
        if (!userIds.length) {
            userIds = await TicketingBookings.find({
                "ticket.snapshot.event": eventId,
                status: "valid",
            }).distinct("user");
        }

        if (!userIds.length) {
            return;
        }

        await sendUserNotifications({
            recipientIds: userIds,
            title: config.title(event, context),
            body: config.body(event, context),
            data: {
                type: config.type,
                eventId,
                objectType: "events",
            },
            sender: event.basicInfo.organization,
            objectId: eventId,
            image:
                event.basicInfo.media?.type === "image"
                    ? event.basicInfo.media.name
                    : null,
        });

    } catch (err) {
        console.error("[NOTIFICATION] Failed:", err);
    }
};

module.exports = { sendEventNotification };
