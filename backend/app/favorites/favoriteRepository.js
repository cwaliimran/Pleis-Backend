const { Favorites } = require("../../commonModules/favorites/Favorite");
const { getWithFilters } = require('@dbUtils/queryUtil');
const { getMinTicketPricesByEventIds } = require("../ticketing/ticketingsRepository");

/**
 * Toggle favorite for a user and target
 * If already favorited → remove it
 * If not → add it
 */
const toggleFavorite = async (userId, targetId, targetType) => {
    const filter = { user: userId, targetId, targetType };
    const existing = await Favorites.findOne(filter);

    if (existing) {
        await Favorites.deleteOne(filter);
        return { isFavorited: false };
    } else {
        await Favorites.create(filter);
        return { isFavorited: true };
    }
};

/**
 * Check if a user has favorited a target
 */
const isFavorited = async (userId, targetId, targetType) => {
    const exists = await Favorites.exists({ user: userId, targetId, targetType });
    return !!exists;
};

/**
 * Count total favorites for a target
 */
const countFavorites = async (filter) => {
    return Favorites.countDocuments(filter);
};

const getUserFavorites = async (userId, targetType, page, limit) => {
    let filter = { user: userId };
    if (targetType) {
        filter.targetType = targetType;
        let filtered = await getWithFilters({
            model: Favorites,
            query: filter,
            refPath: "targetType",
            localField: "targetId",
            refLookups,
            options: { page, limit },
        });

        // Fetch minimum ticket prices for all events in results if targetType is 'event'
        if (targetType === 'event') {
            const eventIds = filtered.map((e) => e?.object?._id);
            const ticketPriceMap = await getMinTicketPricesByEventIds(eventIds);

            // Attach minimum ticket price to each event
            filtered.forEach((event) => {
            const eventId = event?.object?._id?.toString();
            const minPrice = eventId ? ticketPriceMap[eventId] : null;
            event.ticketInfo = minPrice ? { price: `€${minPrice}` } : null;
            });
        }



        return filtered;
    } else {
        // Return both events and organizations favorites in parallel
        const [events, organizations] = await Promise.all([
            getWithFilters({
            model: Favorites,
            query: { user: userId, targetType: 'event' },
            refPath: "targetType",
            localField: "targetId",
            refLookups,
            options: { page, limit: 10 },
            }),
            getWithFilters({
            model: Favorites,
            query: { user: userId, targetType: 'organization' },
            refPath: "targetType",
            localField: "targetId",
            refLookups,
            options: { page, limit: 10 },
            }),
        ]);

          // Fetch minimum ticket prices for all events in results
            const eventIds = events.map((e) => e._id);
            const ticketPriceMap = await getMinTicketPricesByEventIds(eventIds);

            // Attach minimum ticket price to each event
            events.forEach((event) => {
              const minPrice = ticketPriceMap[event._id.toString()] || null;
              event.ticketInfo = minPrice ? { price: `€${minPrice}` } : null;
            });

        return {
            events,
            organizations,
        }
    }

};

const refLookups = {
    event: {
        from: "events",
        project: { "basicInfo.title": 1, "basicInfo.media": 1, "basicInfo.organization": 1, "basicInfo.venueLocation": 1, schedule: 1 },
        subLookups: [
            {
                from: "organizations",
                as: "basicInfo.organization",
                localField: "basicInfo.organization",
                project: { "basicInfo.name": 1, "basicInfo.media": 1, },
                single: true,
            },
        ],
    },
    organization: {
        from: "organizations",
        project: {
            "basicInfo.name": 1,
            "basicInfo.media.logo": 1,
            location: 1,
            "otherInfo.categories": 1,
        },
        subLookups: [
            {
                from: "categories",
                as: "otherInfo.categories",
                localField: "otherInfo.categories",
                project: { _id: 1, title: 1, image: 1 },
            },
        ],
    },
    menu: {
        from: "menus",
        project: { "title": 1, },

    },

}

module.exports = {
    toggleFavorite,
    isFavorited,
    countFavorites,
    getUserFavorites,
};
