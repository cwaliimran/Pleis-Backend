const mongoose = require("mongoose");

const {
  GlobalBasePromotion,
  GlobalHappyHourPromotion,
  GlobalClaimPromotion,
} = require("../../../commonModules/globalLoyalty/promotions/models/Promotion");

const { cache, invalidate } = require("@redisCache");

const ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY =
  "globalLoyaltyPromotions:active";

const buildGlobalLoyaltyPromotionsCacheKey = ({
  scope = "public",
  skip = 0,
  limit = 10,
}) =>
  `${ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;


// ---------------- MODEL SELECTOR ----------------
const getModelByPromotionType = (promotionType) => {
  switch (promotionType) {
    case "globalHappyHourPromotion":
      return GlobalHappyHourPromotion;
    case "globalClaimPromotion":
      return GlobalClaimPromotion;
    default:
      return GlobalBasePromotion;
  }
};


// ---------------- CREATE ----------------
const create = async (data) => {
  const Model = getModelByPromotionType(data.promotionType);
  const item = new Model(data);
  const saved = await item.save();

  await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY);

  return saved.toObject();
};


// ---------------- LIST WITH FILTERS ----------------
// const getWithFilters = async (
//   query,
//   skip = 0,
//   limit = 20,
//   keyword,
//   sortBy,
//   sortOrder
// ) => {
//   let cacheKey = buildGlobalLoyaltyPromotionsCacheKey({
//     scope: "admin",
//     skip,
//     limit,
//   });

//   const filters = [];
//   if (keyword) filters.push(`keyword=${keyword}`);
//   if (query.status?.$ne) filters.push(`status=${query.status.$ne}`);
//   if (query.createdAt?.$gte)
//     filters.push(`createdAt=${query.createdAt.$gte}`);

//   if (filters.length) {
//     cacheKey += `:${filters.join(":")}`;
//   }

//   return cache({
//     namespace: cacheKey,
//     ttl: 86400,

//     fetchFn: async () => {
//       const pipeline = [
//         { $match: query },
//         { $sort: { createdAt: -1 } },
//         { $skip: skip },
//       ];

//       if (limit > 0) pipeline.push({ $limit: limit });

//       pipeline.push(
//         {
//           $lookup: {
//             from: "globalrewards",
//             localField: "reward",
//             foreignField: "_id",
//             as: "reward",
//           },
//         },
//         {
//           $lookup: {
//             from: "menuitems",
//             localField: "menuItem",
//             foreignField: "_id",
//             as: "menuItem",
//           },
//         },
//         {
//           $lookup: {
//             from: "globalstatuslevels",
//             localField: "tierLimit",
//             foreignField: "_id",
//             as: "tierLimit",
//           },
//         },
//         {
//           $addFields: {
//             reward: { $arrayElemAt: ["$reward", 0] },
//             menuItem: { $arrayElemAt: ["$menuItem", 0] },
//             tierLimit: { $arrayElemAt: ["$tierLimit", 0] },
//           },
//         }
//       );

//       return GlobalBasePromotion.aggregate(pipeline).allowDiskUse(true);
//     },
//   });
// };
const getWithFilters = async (
  query,
  skip = 0,
  limit = 20,
  keyword,
  sortBy = "createdAt",
  sortOrder = "desc"
) => {
  let cacheKey = buildGlobalLoyaltyPromotionsCacheKey({
    scope: "admin",
    skip,
    limit,
    sortBy,
    sortOrder,
  });

  const filters = [];
  if (keyword) filters.push(`keyword=${keyword}`);
  if (query.status?.$ne) filters.push(`status=${query.status.$ne}`);
  if (query.createdAt?.$gte) filters.push(`createdAt=${query.createdAt.$gte}`);
  if (sortBy) filters.push(`sortBy=${sortBy}`);
  if (sortOrder) filters.push(`sortOrder=${sortOrder}`);

  if (filters.length) {
    cacheKey += `:${filters.join(":")}`;
  }

  return cache({
    namespace: cacheKey,
    ttl: 86400,

    fetchFn: async () => {
      const sortDirection = sortOrder === "asc" ? 1 : -1;

      let sortStage = { createdAt: -1, _id: -1 };

      if (sortBy === "title") {
        sortStage = { titleSort: sortDirection, _id: -1 };
      } else if (sortBy === "description") {
        sortStage = { descriptionSort: sortDirection, _id: -1 };
      } else if (sortBy === "promotionType") {
        sortStage = { promotionTypeSort: sortDirection, _id: -1 };
      } else if (sortBy === "createdAt") {
        sortStage = { createdAt: sortDirection, _id: sortDirection };
      }

      const pipeline = [
        { $match: query },
        {
          $addFields: {
            titleSort: { $toLower: { $ifNull: ["$title", ""] } },
            descriptionSort: { $toLower: { $ifNull: ["$description", ""] } },
            promotionTypeSort: { $toLower: { $ifNull: ["$promotionType", ""] } },
          },
        },
        { $sort: sortStage },
        { $skip: skip },
      ];

      if (limit > 0) pipeline.push({ $limit: limit });

      pipeline.push(
        {
          $lookup: {
            from: "globalrewards",
            localField: "reward",
            foreignField: "_id",
            as: "reward",
          },
        },
        {
          $lookup: {
            from: "menuitems",
            localField: "menuItem",
            foreignField: "_id",
            as: "menuItem",
          },
        },
        {
          $lookup: {
            from: "globalstatuslevels",
            localField: "tierLimit",
            foreignField: "_id",
            as: "tierLimit",
          },
        },
        {
          $addFields: {
            reward: { $arrayElemAt: ["$reward", 0] },
            menuItem: { $arrayElemAt: ["$menuItem", 0] },
            tierLimit: { $arrayElemAt: ["$tierLimit", 0] },
          },
        },
        {
          $project: {
            titleSort: 0,
            descriptionSort: 0,
            promotionTypeSort: 0,
          },
        }
      );

      return GlobalBasePromotion.aggregate(pipeline).allowDiskUse(true);
    },
  });
};

// ---------------- BASIC HELPERS ----------------
const count = async (query = {}) =>
  GlobalBasePromotion.countDocuments(query);

const findById = async (id) =>
  GlobalBasePromotion.findById(id)
    .populate("menuItem")
    .populate({ path: "tierLimit", select: "image title" })
    .exec();

const updateData = async (item, data) => {
  Object.assign(item, data);
  const saved = await item.save();
  await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY);
  return saved;
};

const deleteItem = async (item) => {
  await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY);
  return item.deleteOne();
};

const findByIdAndUpdate = async (id, data) => {
  const updated = await GlobalBasePromotion.findByIdAndUpdate(
    id,
    data,
    { new: true }
  )
    .populate("menuItem")
    .populate("tierLimit");

  await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY);

  return updated;
};


// ---------------- RECURRING BULK OPS ----------------
// used by service FUTURE scope

const updateFutureOccurrences = async (
  parentId,
  index,
  data
) => {
  await GlobalBasePromotion.updateMany(
    {
      "recurringMeta.parentPromotion": parentId,
      "recurringMeta.occurrenceIndex": { $gte: index },
      status: { $ne: "deleted" },
    },
    { $set: data }
  );

  await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY);
};

const deleteFutureOccurrences = async (
  parentId,
  index
) => {
  await GlobalBasePromotion.updateMany(
    {
      "recurringMeta.parentPromotion": parentId,
      "recurringMeta.occurrenceIndex": { $gte: index },
    },
    { $set: { status: "deleted" } }
  );

  await GlobalBasePromotion.updateOne(
    { _id: parentId },
    { $set: { status: "deleted" } }
  );

  await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY);
};


// ---------------- ACTIVE HAPPY HOUR ----------------
const getActiveGlobalLoyaltyHappyHourPromotion = async ({
  userId,
  userTierEntryPoints = 0,
  now = new Date(),
}) => {
  if (!userId) return null;

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [promotion] = await GlobalBasePromotion.aggregate([
    {
      $match: {
        promotionType: "globalHappyHourPromotion",
        status: "active",
        startDate: { $lte: now },
        endDate: { $gte: now },
      },
    },

    // lookup tier
    {
      $lookup: {
        from: "globalstatuslevels",
        localField: "tierLimit",
        foreignField: "_id",
        as: "tierLimit",
      },
    },
    { $unwind: "$tierLimit" },

    // tier eligibility
    {
      $match: {
        $expr: {
          $lte: ["$tierLimit.entryPoints", userTierEntryPoints],
        },
      },
    },

    {
      $lookup: {
        from: "globalpromotionsorders",
        let: { promoId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$promotion", "$$promoId"] },
              user: userObjectId,
              status: { $in: ["claimed", "redeemed"] },
            },
          },
          { $count: "userClaims" },
        ],
        as: "claimStats",
      },
    },

    {
      $addFields: {
        userClaims: {
          $ifNull: [
            { $arrayElemAt: ["$claimStats.userClaims", 0] },
            0,
          ],
        },
      },
    },

    {
      $match: {
        $expr: {
          $or: [
            { $eq: ["$claimLimit", null] },
            { $gt: ["$claimLimit", "$userClaims"] },
          ],
        },
      },
    },

    { $sort: { pointsMultiplier: -1 } },
    { $limit: 1 },

    {
      $addFields: {
        remainingClaims: {
          $cond: [
            { $eq: ["$claimLimit", null] },
            null,
            { $subtract: ["$claimLimit", "$userClaims"] },
          ],
        },
      },
    },

    { $project: { claimStats: 0 } },
  ]);

  if (!promotion) return null;

  const recurrence = promotion.recurringDetails;
  if (!recurrence?.isEnabled) return promotion;

  const nowDate = now;
  const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const todayKey = dayMap[nowDate.getDay()];

  // weekly restriction
  if (
    recurrence.frequency === "weekly" &&
    recurrence.daysOfWeek.length &&
    !recurrence.daysOfWeek.includes(todayKey)
  ) {
    return null;
  }

  // recurrence end check
  if (
    recurrence.endDate &&
    nowDate > recurrence.endDate
  ) {
    return null;
  }

  /* =============================
     HAPPY HOUR TIME WINDOW
  ============================= */

  const start = promotion.startDate;
  const end = promotion.endDate;

  if (!start || !end) return promotion;

  const startMinutes =
    start.getUTCHours() * 60 + start.getUTCMinutes();

  const endMinutes =
    end.getUTCHours() * 60 + end.getUTCMinutes();

  const currentMinutes =
    nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes();

  // supports midnight crossing
  const insideWindow =
    startMinutes <= endMinutes
      ? currentMinutes >= startMinutes &&
      currentMinutes <= endMinutes
      : currentMinutes >= startMinutes ||
      currentMinutes <= endMinutes;

  if (!insideWindow) return null;

  return promotion;

};


const updateMany = async (filter, update) => {
  return GlobalBasePromotion.updateMany(filter, update);
};

const updateOne = async (filter, update) => {
  return GlobalBasePromotion.updateOne(filter, update);
};

// ---------------- EXPORT ----------------
module.exports = {
  create,
  getWithFilters,
  count,
  findById,
  updateData,
  deleteItem,
  findByIdAndUpdate,
  updateFutureOccurrences,
  deleteFutureOccurrences,
  getActiveGlobalLoyaltyHappyHourPromotion,
  updateMany,
  updateOne
};
