const { RecentlyViewedItems } = require("./RecentlyViewedItem");
const { getWithFilters } = require("@dbUtils/queryUtil");

/**
 * Add or update a recently viewed item for a user
 * - If the record exists → updates the viewedAt timestamp
 * - If not → inserts a new one
 */
const addOrUpdateRecentlyViewedItem = async (userId, targetId, targetType) => {
  try {
    await RecentlyViewedItems.updateOne(
      { user: userId, targetId, targetType },
      { $set: { viewedAt: new Date() } },
      { upsert: true }
    );
    return { success: true };
  } catch (err) {
    console.error("Error updating RecentlyViewedItem:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Check if a user has viewed a target recently
 */
const isRecentlyViewed = async (userId, targetId, targetType) => {
  const exists = await RecentlyViewedItems.exists({ user: userId, targetId, targetType });
  return !!exists;
};

/**
 * Get user’s recently viewed items
 * Optionally filter by targetType (“event” | “organization”)
 */
const getUserRecentlyViewedItems = async (userId, targetType, page = 1, limit = 10) => {
  const baseFilter = { user: userId };
  if (targetType) baseFilter.targetType = targetType;

  const options = { page, limit, sort: { viewedAt: -1 } };

  if (targetType) {
    // Fetch specific type (e.g. only events)
    return getWithFilters({
      model: RecentlyViewedItems,
      query: baseFilter,
      refPath: "targetType",
      localField: "targetId",
      refLookups,
      options,
    });
  }

  // Otherwise, fetch 10 of each type
  const [events, organizations] = await Promise.all([
    getWithFilters({
      model: RecentlyViewedItems,
      query: { user: userId, targetType: "event" },
      refPath: "targetType",
      localField: "targetId",
      refLookups,
      options: { ...options, limit: 10 },
    }),
    getWithFilters({
      model: RecentlyViewedItems,
      query: { user: userId, targetType: "organization" },
      refPath: "targetType",
      localField: "targetId",
      refLookups,
      options: { ...options, limit: 10 },
    }),
  ]);

  return {
    key: "recentlyViewed",
    title: "Recently Viewed",
    data: { events, organizations },
  };
};

/**
 * Count total recently viewed items for a given filter
 */
const countRecentlyViewedItems = async (filter) => {
  return RecentlyViewedItems.countDocuments(filter);
};

/**
 * Reference lookup definitions for each type
 */
const refLookups = {
  event: {
    from: "events",
    project: {
      "basicInfo.title": 1,
      "basicInfo.media": 1,
      "basicInfo.organization": 1,
      "basicInfo.venueLocation": 1,
      schedule: 1,
    },
    subLookups: [
      {
        from: "organizations",
        as: "basicInfo.organization",
        localField: "basicInfo.organization",
        project: {
          "basicInfo.name": 1,
          "basicInfo.media": 1,
        },
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
    project: { title: 1 },
  },
};

module.exports = {
  addOrUpdateRecentlyViewedItem,
  isRecentlyViewed,
  countRecentlyViewedItems,
  getUserRecentlyViewedItems,
};
