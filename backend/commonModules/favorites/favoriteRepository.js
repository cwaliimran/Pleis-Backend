const mongoose = require("mongoose");
const { Favorites } = require("../../commonModules/favorites/Favorite");

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
const countFavorites = async (targetId, targetType) => {
    return Favorites.countDocuments({ targetId, targetType });
};

/**
 * Get all favorites of a user (optional pagination)
 */
const getUserFavorites = async (userId, targetType, skip = 0, limit = 10) => {
    const filter = { user: userId };
    if (targetType) filter.targetType = targetType;

    return Favorites.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });
};

module.exports = {
    toggleFavorite,
    isFavorited,
    countFavorites,
    getUserFavorites,
};
