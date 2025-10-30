const favoriteRepo = require("./favoriteRepository");
const Organizations = require("../../commonModules/organizations/Organization");
const Menus = require("../menuManagement/menu/Menus");
const { Events } = require("../events/Event");
const { generateMeta } = require("../../helperUtils/responseUtil");

/**
 * Maps target types to their corresponding Mongoose models.
 * Helps auto-update meta.favoritesCount on correct collection.
 */
const MODEL_MAP = {
  menu: Menus,
  event: Events,
  organization: Organizations,
};

/**
 * Toggle favorite for a user and target.
 * Automatically updates `meta.favoritesCount` in the target document.
 */
const toggleFavorite = async (userId, targetId, targetType) => {
  const result = await favoriteRepo.toggleFavorite(userId, targetId, targetType);
  const count = await favoriteRepo.countFavorites(targetId, targetType);

  // Update meta.favoritesCount in the appropriate model
  const Model = MODEL_MAP[targetType];
  if (Model) {
    await Model.updateOne({ _id: targetId }, { "meta.favoritesCount": count });
  }

  return {
    isFavorited: result.isFavorited,
    favoritesCount: count,
  };
};

/**
 * Check if a user has favorited a given target
 */
const isFavorited = async (userId, targetId, targetType) => {
  return await favoriteRepo.isFavorited(userId, targetId, targetType);
};

/**
 * Count total favorites for a target
 */
const getFavoriteCount = async (targetId, targetType) => {
  return await favoriteRepo.countFavorites(targetId, targetType);
};

/**
 * Get a paginated list of user's favorites
 */
const getUserFavorites = async ({ userId, targetType, page = 1, limit = 20 }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const favorites = await favoriteRepo.getUserFavorites(
    userId,
    targetType,
    skip,
    limit
  );

  const total = favorites.length; // optionally replace with count if needed
  const totalPages =
    limit && total != null ? Math.ceil(total / limit) : 1;

  const meta = generateMeta(page, limit, total);

  return { favorites, meta };
};

/**
 * Remove all favorites for a deleted user or target (cleanup utility)
 */
const removeFavoritesByFilter = async (filter) => {
  return await favoriteRepo.deleteMany(filter);
};

module.exports = {
  toggleFavorite,
  isFavorited,
  getFavoriteCount,
  getUserFavorites,
  removeFavoritesByFilter,
};
