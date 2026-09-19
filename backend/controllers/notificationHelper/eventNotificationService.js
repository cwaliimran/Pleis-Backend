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
        titleKey: "ticket_confirmed_title",
        bodyKey: "ticket_confirmed_body",
        titleValues: (event) => ({ eventTitle: event.basicInfo.title }),
        bodyValues: (_event, context) => ({
            ticketsPurchased: context.ticketsPurchased || 0,
        }),
    },

    TICKET_CANCELLED: {
        type: NotificationTypes.TICKET_CANCELLED,
        titleKey: "ticket_cancelled_title",
        bodyKey: "ticket_cancelled_body",
        titleValues: (event) => ({ eventTitle: event.basicInfo.title }),
    },

    EVENT_CANCELLED: {
        type: NotificationTypes.EVENT_CANCELLED,
        titleKey: "event_cancelled_title",
        bodyKey: "event_cancelled_body",
        bodyValues: (event) => ({ eventTitle: event.basicInfo.title }),
    },

    EVENT_RESCHEDULED: {
        type: NotificationTypes.EVENT_RESCHEDULED,
        titleKey: "event_rescheduled_title",
        bodyKey: "event_rescheduled_body",
        bodyValues: (event, context) => ({
            eventTitle: event.basicInfo.title,
            newDate: context.newDate,
        }),
    },

    EVENT_STARTING_24H: {
        type: NotificationTypes.EVENT_STARTING_24H,
        titleKey: "event_starting_24h_title",
        bodyKey: "event_starting_24h_body",
        bodyValues: (event) => ({ eventTitle: event.basicInfo.title }),
    },

    EVENT_STARTING_2H: {
        type: NotificationTypes.EVENT_STARTING_2H,
        titleKey: "event_starting_2h_title",
        bodyKey: "event_starting_2h_body",
        bodyValues: (event) => ({ eventTitle: event.basicInfo.title }),
    },

    EVENT_STARTED: {
        type: NotificationTypes.EVENT_STARTED,
        titleKey: "event_started_title",
        bodyKey: "event_started_body",
        bodyValues: (event) => ({ eventTitle: event.basicInfo.title }),
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
            titleKey: config.titleKey,
            bodyKey: config.bodyKey,
            titleValues: config.titleValues
                ? config.titleValues(event, context)
                : {},
            bodyValues: config.bodyValues
                ? config.bodyValues(event, context)
                : {},
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
