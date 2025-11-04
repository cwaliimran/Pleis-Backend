const { Favorites } = require("../../commonModules/favorites/Favorite");
const { getWithFilters } = require('@dbUtils/queryUtil');

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
        let filtered = getWithFilters({
            model: Favorites,
            query: filter,
            refPath: "targetType",
            localField: "targetId",
            refLookups,
            options: { page, limit },
        });
        return filtered;
    } else {
        //return 10 
        let events = getWithFilters({
            model: Favorites,
            query: { targetType: 'event' },
            refPath: "targetType",
            localField: "targetId",
            refLookups,
            options: { page, limit: 10 },
        });
        let organizations = getWithFilters({
            model: Favorites,
            query: { targetType: 'organization' },
            refPath: "targetType",
            localField: "targetId",
            refLookups,
            options: { page, limit: 10 },
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
