
const BadgeCategories = require("@BadgeCategoriesModel"); 
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const { formatCategories } = require("./formatters/categoryFormatter");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_BADGE_CATEGORIES_CACHE_KEY = "badgeCategories:active";
const buildBadgeCategoriesCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_BADGE_CATEGORIES_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};
const createBadgeCategories = async (data) => {
  try {
    const badgeCategories = new BadgeCategories(data);
    await badgeCategories.save();
    await invalidate(ACTIVE_BADGE_CATEGORIES_CACHE_KEY);
    return badgeCategories;
  } catch (err) {
    throw err;
  }
};



const getBadgeCategoriess = async ({ timezone,page, limit, keyword, status, userId, date, range,today,skip }) => {
  const cacheKey = buildBadgeCategoriesCacheKey({
    scope: "admin",
    skip,
    limit,
  });
  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day
 
    fetchFn: async () => {
  const pipeline = [];

  // Apply filters
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

if (keyword) {
  const keywordMatch = buildKeywordQueryFromModels(
    [
      { schema: BadgeCategories.schema }
    ],
    keyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }
}

  pipeline.push({ $sort: { createdAt: -1 } });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  const result = await BadgeCategories.aggregate(pipeline);

  let BadgeCategoriess = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    BadgeCategories.countDocuments({ ...(userId && { userId: userId }), status: { $ne: "deleted" } }),
    BadgeCategories.countDocuments({ status: "active", ...(userId && { userId: userId }) }),
    BadgeCategories.countDocuments({ status: "inactive", ...(userId && { userId: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.BadgeCategoriessCount = { total, active, inactive };
const formattedBadgeCategoriess = formatCategories(BadgeCategoriess, timezone);
  return {BadgeCategoriess : formattedBadgeCategoriess, meta}
},
  });
};

const findBadgeCategoriesById = async (id) => {
  return BadgeCategories.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
   await invalidate(ACTIVE_BADGE_CATEGORIES_CACHE_KEY);
  return BadgeCategories.findByIdAndUpdate(id, data, { new: true });
};
const deleteBadgeCategories = async (id) => {
  await invalidate(ACTIVE_BADGE_CATEGORIES_CACHE_KEY);
  return await BadgeCategories.findByIdAndDelete(id);
};

const updateBadgeStatusById = async (id, status) => {
   await invalidate(ACTIVE_BADGE_CATEGORIES_CACHE_KEY);
  return findByIdAndUpdate(id, { status });
};
module.exports = {
  createBadgeCategories,
  getBadgeCategoriess,
  findBadgeCategoriesById,
  findByIdAndUpdate,
  deleteBadgeCategories,
  updateBadgeStatusById

};