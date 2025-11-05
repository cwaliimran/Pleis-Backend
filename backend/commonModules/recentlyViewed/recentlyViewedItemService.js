const recentlyViewedItemRepo = require("./recentlyViewedItemRepository");
const Organizations = require("../organizations/Organization");
const Menus = require("../menuManagement/menu/Menus");
const { Events } = require("../events/Event");
const { generateMeta } = require("../../helperUtils/responseUtil");
const { formatRecentlyViewedOrganization, formatRecentlyViewedEventResponse } = require("./formatter/recentlyViewedItemsFormatter");
const { Favorites } = require("../favorites/Favorite");

const MODEL_MAP = {
  menu: Menus,
  event: Events,
  organization: Organizations,
};

/**
 * Add or update recently viewed item for a user.
 * Automatically updates meta.recentlyViewedItemsCount in the target document.
 */
const addOrUpdateRecentlyViewedItem = async (userId, targetId, targetType) => {
  await recentlyViewedItemRepo.addOrUpdateRecentlyViewedItem(userId, targetId, targetType);

  // Update meta.recentlyViewedItemsCount in the respective target
  const count = await recentlyViewedItemRepo.countRecentlyViewedItems({ targetId, targetType });
  const Model = MODEL_MAP[targetType];
  if (Model) {
    await Model.updateOne({ _id: targetId }, { "meta.viewsCount": count });
  }

  return { isRecentlyViewedItem: true };
};

/**
 * Check if user has viewed target recently
 */
const isRecentlyViewedItemd = async (userId, targetId, targetType) => {
  return await recentlyViewedItemRepo.isRecentlyViewed(userId, targetId, targetType);
};

/**
 * Count total recently viewed items for a target
 */
const getRecentlyViewedItemCount = async (targetId, targetType) => {
  return await recentlyViewedItemRepo.countRecentlyViewedItems({ targetId, targetType });
};

/**
 * Get a paginated list of user’s recently viewed items
 */
const getUserRecentlyViewedItems = async ({
  userId,
  location,
  timezone,
  targetType,
  page = 1,
  limit = 20,
}) => {
  let recentlyViewedItems, counts;

  if (targetType) {
    let [items, count] = await Promise.all([
      recentlyViewedItemRepo.getUserRecentlyViewedItems(userId, targetType, page, limit),
      recentlyViewedItemRepo.countRecentlyViewedItems({ user: userId, targetType }),
    ]);

    // TODO : Add "favorite" flag for organizations and other types as well if needed
    if (targetType === "event") {
      // Add "favorite" flag
      if (userId && items.length > 0) {
        const eventIds = items.map((e) => e.targetId);
        const userFavorites = await Favorites.find({
          user: userId,
          targetType: "event",
          targetId: { $in: eventIds },
        }).select("targetId");

        const favoriteSet = new Set(userFavorites.map((f) => f.targetId.toString()));

        items = items.map((event) => ({
          ...event,
          isFavorite: favoriteSet.has(event.targetId.toString()),
        }));
      }
    }


    recentlyViewedItems = items?.map((viewed) => {
      const obj = viewed.object;
      let formattedObject;

      if (viewed.targetType === "organization") {
        formattedObject = formatRecentlyViewedOrganization(obj);
      } else if (viewed.targetType === "event") {
        formattedObject = formatRecentlyViewedEventResponse(obj, {
          userLocation: location,
          timezone,
        });
      } else {
        formattedObject = obj;
      }

      return {
        ...viewed.toObject?.() || viewed,
        object: formattedObject,
      };
    });

    counts = count;
  } else {
    // Fetch both events & orgs in parallel
    const [events, organizations, eventCount, orgCount] = await Promise.all([
      recentlyViewedItemRepo.getUserRecentlyViewedItems(userId, "event", page, 10),
      recentlyViewedItemRepo.getUserRecentlyViewedItems(userId, "organization", page, 10),
      recentlyViewedItemRepo.countRecentlyViewedItems({ user: userId, targetType: "event" }),
      recentlyViewedItemRepo.countRecentlyViewedItems({ user: userId, targetType: "organization" }),
    ]);

    recentlyViewedItems = {
      events: events?.map((v) => ({
        ...v.toObject?.() || v,
        object: formatRecentlyViewedEventResponse(v.object, { userLocation: location, timezone }),
      })),
      organizations: organizations?.map((v) => ({
        ...v.toObject?.() || v,
        object: formatRecentlyViewedOrganization(v.object),
      })),
    };

    counts = {
      events: eventCount,
      organizations: orgCount,
    };
  }

  const meta = generateMeta(page, limit, counts);
  return { recentlyViewedItems, meta };
};

/**
 * Cleanup utility
 */
const removeRecentlyViewedItemsByFilter = async (filter) => {
  return await recentlyViewedItemRepo.deleteMany(filter);
};

module.exports = {
  addOrUpdateRecentlyViewedItem,
  isRecentlyViewedItemd,
  getRecentlyViewedItemCount,
  getUserRecentlyViewedItems,
  removeRecentlyViewedItemsByFilter,
};
