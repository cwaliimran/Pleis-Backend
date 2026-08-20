const {
  getRewardById,
} = require("../../../app/loyalty/rewards/rewardsRepository");
const {
  Promotion,
  BuyMenuItemPromotion,
  HappyHourPromotion,
  ProductSalePromotion,
  ClaimPromotion,
  extraPointsForItemPromotion,
} = require("../../../commonModules/loyalty/promotions/models/Promotion/");

const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const hasTimeValue = (value) => value != null && value !== "";

const timeToMinutes = (time) => {
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
};

/**
 * startTime/endTime are optional UTC "HH:mm" strings.
 * Both null = no time restriction. One without the other is invalid.
 * startTime > endTime is valid (midnight-crossing window).
 */
const validatePromotionTimes = (startTime, endTime) => {
  const hasStart = hasTimeValue(startTime);
  const hasEnd = hasTimeValue(endTime);

  if (hasStart !== hasEnd) {
    throw new Error(
      "startTime and endTime must both be provided or both be null",
    );
  }

  if (!hasStart && !hasEnd) {
    return { startTime: null, endTime: null };
  }

  if (!HH_MM_PATTERN.test(startTime) || !HH_MM_PATTERN.test(endTime)) {
    throw new Error("startTime and endTime must be in HH:mm format");
  }

  return { startTime, endTime };
};

const resolvePromotionTimes = (incoming = {}, existing = {}) => {
  const startTime =
    incoming.startTime !== undefined ? incoming.startTime : existing.startTime;
  const endTime =
    incoming.endTime !== undefined ? incoming.endTime : existing.endTime;

  return validatePromotionTimes(startTime, endTime);
};

/**
 * Optional time-of-day eligibility.
 * Stored startTime/endTime are UTC "HH:mm". null/null skips the check.
 */
const isPromotionTimeActive = ({
  startTime,
  endTime,
  now = new Date(),
} = {}) => {
  if (!hasTimeValue(startTime) && !hasTimeValue(endTime)) {
    return true;
  }

  if (!hasTimeValue(startTime) || !hasTimeValue(endTime)) {
    return false;
  }

  if (!HH_MM_PATTERN.test(startTime) || !HH_MM_PATTERN.test(endTime)) {
    return false;
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  return startMinutes <= endMinutes
    ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
    : currentMinutes >= startMinutes || currentMinutes <= endMinutes;
};

const isPromotionDayActive = ({ activeDays, now = new Date() } = {}) => {
  if (!activeDays || activeDays.mode !== "selective" || !activeDays.days?.length) {
    return true;
  }

  const todayKey = DAY_KEYS[now.getUTCDay()];
  return activeDays.days.includes(todayKey);
};

const isPromotionRecurrenceActive = ({
  recurringDetails,
  now = new Date(),
} = {}) => {
  if (!recurringDetails?.isEnabled) {
    return true;
  }

  if (recurringDetails.endDate && now > new Date(recurringDetails.endDate)) {
    return false;
  }

  if (
    recurringDetails.frequency === "weekly" &&
    recurringDetails.daysOfWeek?.length
  ) {
    const todayKey = DAY_KEYS[now.getUTCDay()];
    if (!recurringDetails.daysOfWeek.includes(todayKey)) {
      return false;
    }
  }

  return true;
};

const isPromotionScheduleActive = ({
  startDate,
  endDate,
  startTime,
  endTime,
  activeDays,
  recurringDetails,
  now = new Date(),
} = {}) => {
  if (startDate && now < new Date(startDate)) {
    return false;
  }

  if (endDate && now > new Date(endDate)) {
    return false;
  }

  if (!isPromotionRecurrenceActive({ recurringDetails, now })) {
    return false;
  }

  if (!isPromotionDayActive({ activeDays, now })) {
    return false;
  }

  return isPromotionTimeActive({ startTime, endTime, now });
};

// Decide which discriminator model to use
const getModelBypromotionType = (promotionType) => {
  switch (promotionType) {
    case "buyMenuItemPromotion":
      return BuyMenuItemPromotion;
    case "happyHour":
      return HappyHourPromotion;
    case "productSale":
      return ProductSalePromotion;
    case "claimPromotion":
      return ClaimPromotion;
    case "extraPointsForItem":
      return extraPointsForItemPromotion;
    default:
      return Promotion; // fallback
  }
};

// Create promotion
const create = async (data) => {
  try {
    const times = resolvePromotionTimes(data);
    data.startTime = times.startTime;
    data.endTime = times.endTime;

    const Model = getModelBypromotionType(data.promotionType);
    const reward = await getRewardById(data.reward);
    if (data.promotionType === "claimPromotion") {
      if (data.claimLimit > reward.claimLimit) {
        throw new Error(
          "Promotion claim limit cannot exceed reward claim limit",
        );
      }
    }
    const item = new Model(data);
    const saved = await item.save();
    return saved.toObject(); // Removes Mongoose internals
  } catch (err) {
    throw err;
  }
};

// const getWithFilters = async (query, skip = 0, limit = 20) => {

//   // Build aggregation pipeline
//   const pipeline = [
//     { $match: query },
//     { $sort: { createdAt: -1 } },
//     { $skip: skip },
//   ];

//   if (limit > 0) pipeline.push({ $limit: limit });

//   // --- Lookup reward (for claimPromotion) ---
//   pipeline.push({
//     $lookup: {
//       from: "rewards",
//       localField: "reward",
//       foreignField: "_id",
//       as: "reward",
//     },
//   });

//   // --- Lookup menuItem (for buyMenuItemPromotion and productSale) ---
//   pipeline.push({
//     $lookup: {
//       from: "menuitems",
//       localField: "menuItem",
//       foreignField: "_id",
//       as: "menuItem",
//     },
//   });

//   // --- Lookup tierLimit (populate tier title and image) ---
//   pipeline.push({
//     $lookup: {
//       from: "tiers",
//       localField: "tierLimit",
//       foreignField: "_id",
//       as: "tierLimit",
//       pipeline: [
//         { $project: { _id: 1, title: 1, } }
//       ]
//     }
//   });

//   // --- Conditionally include the correct populated field based on promotionType ---
//   pipeline.push({
//     $addFields: {
//       reward: {
//         $cond: [
//           { $eq: ["$promotionType", "claimPromotion"] },
//           { $arrayElemAt: ["$reward", 0] },
//           null,
//         ],
//       },
//       menuItem: {
//         $cond: [
//           { $in: ["$promotionType", ["buyMenuItemPromotion", "productSale"]] },
//           { $arrayElemAt: ["$menuItem", 0] },
//           null,
//         ],
//       },
//       tierLimit: {
//         $cond: [
//           { $ne: ["$tierLimit", []] },
//           { $arrayElemAt: ["$tierLimit", 0] },
//           null,
//         ],
//       },
//     },
//   });

//   const results = await Promotion.aggregate(pipeline).allowDiskUse(true);
//   return results;
// };
const getWithFilters = async (
  query,
  skip = 0,
  limit = 20,
  sortBy = "createdAt",
  sortOrder = "desc",
) => {
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

  // shared per-document enrichment: favorites, views, participants, points
  const enrichStages = [
    // total favorites for this promotion
    {
      $lookup: {
        from: "favorites",
        let: { promoId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$targetId", "$$promoId"] },
                  { $eq: ["$targetType", "promotion"] },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "favoritesLookup",
      },
    },
    // total views for this promotion
    {
      $lookup: {
        from: "engagementevents",
        let: { promoId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$entityId", "$$promoId"] },
                  { $eq: ["$entityType", "promotions"] },
                  { $eq: ["$action", "view"] },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "viewsLookup",
      },
    },
    // participants + points awarded (redeemed orders by this organizer for this promotion)
    {
      $lookup: {
        from: "promotionorders",
        let: {
          promoId: "$_id",
          orgId: "$companyOrganizer",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ["$promotion", "$$promoId"] }],
              },
            },
          },
          {
            $group: {
              _id: null,

              // Count participants regardless of status
              participants: { $sum: 1 },

              // Only award points for redeemed orders
              pointsAwarded: {
                $sum: {
                  $cond: [{ $eq: ["$status", "redeemed"] }, "$pointsSpent", 0],
                },
              },
            },
          },
        ],
        as: "orderStats",
      },
    },
    {
      $addFields: {
        totalFavorites: {
          $ifNull: [{ $arrayElemAt: ["$favoritesLookup.count", 0] }, 0],
        },
        totalViews: {
          $ifNull: [{ $arrayElemAt: ["$viewsLookup.count", 0] }, 0],
        },
        participants: {
          $ifNull: [{ $arrayElemAt: ["$orderStats.participants", 0] }, 0],
        },
        pointsAwarded: {
          $ifNull: [{ $arrayElemAt: ["$orderStats.pointsAwarded", 0] }, 0],
        },
      },
    },
    {
      $addFields: {
        avgPointsPerParticipant: {
          $cond: [
            { $gt: ["$participants", 0] },
            { $divide: ["$pointsAwarded", "$participants"] },
            0,
          ],
        },
        viewToParticipantPercentage: {
          $cond: [
            { $gt: ["$totalViews", 0] },
            {
              $min: [
                100,
                {
                  $multiply: [
                    { $divide: ["$participants", "$totalViews"] },
                    100,
                  ],
                },
              ],
            },
            0,
          ],
        },
      },
    },
    {
      $project: {
        favoritesLookup: 0,
        viewsLookup: 0,
        orderStats: 0,
      },
    },
  ];

  const pipeline = [
    { $match: query },

    {
      $addFields: {
        titleSort: { $toLower: { $ifNull: ["$title", ""] } },
        descriptionSort: { $toLower: { $ifNull: ["$description", ""] } },
        promotionTypeSort: { $toLower: { $ifNull: ["$promotionType", ""] } },
      },
    },

    {
      $facet: {
        data: [
          { $sort: sortStage },
          { $skip: skip },
          ...(limit > 0 ? [{ $limit: limit }] : []),

          // existing reward/menuItem/tierLimit lookups
          {
            $lookup: {
              from: "rewards",
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
              pipeline: [{ $project: { _id: 1, title: 1 } }],
              as: "menuItem",
            },
          },
          {
            $lookup: {
              from: "tiers",
              localField: "tierLimit",
              foreignField: "_id",
              as: "tierLimit",
              pipeline: [{ $project: { _id: 1, title: 1 } }],
            },
          },
          {
            $addFields: {
              reward: {
                $cond: [
                  { $eq: ["$promotionType", "claimPromotion"] },
                  { $arrayElemAt: ["$reward", 0] },
                  null,
                ],
              },
              menuItem: {
                $cond: [
                  {
                    $in: [
                      "$promotionType",
                      [
                        "buyMenuItemPromotion",
                        "productSale",
                        "extraPointsForItem",
                      ],
                    ],
                  },
                  "$menuItem",
                  [],
                ],
              },
              tierLimit: {
                $cond: [
                  { $ne: ["$tierLimit", []] },
                  { $arrayElemAt: ["$tierLimit", 0] },
                  null,
                ],
              },
            },
          },

          ...enrichStages,

          {
            $project: {
              titleSort: 0,
              descriptionSort: 0,
              promotionTypeSort: 0,
            },
          },
        ],

        meta: [
          ...enrichStages,
          {
            $group: {
              _id: "$promotionType",
              participants: { $sum: "$participants" },
              pointsAwarded: { $sum: "$pointsAwarded" },
              totalViews: { $sum: "$totalViews" },
              totalFavorites: { $sum: "$totalFavorites" },
            },
          },
          { $sort: { participants: -1 } },
          {
            $group: {
              _id: null,
              totalViews: { $sum: "$totalViews" },
              totalFavorites: { $sum: "$totalFavorites" },
              totalParticipants: { $sum: "$participants" },
              totalPointsAwarded: { $sum: "$pointsAwarded" },
              promotionTypeBreakdown: {
                $push: {
                  promotionType: "$_id",
                  participants: "$participants",
                  pointsAwarded: "$pointsAwarded",
                  totalViews: "$totalViews",
                  totalFavorites: "$totalFavorites",
                },
              },
              highestPromotionType: {
                $first: {
                  promotionType: "$_id",
                  participants: "$participants",
                },
              },
            },
          },
        ],
      },
    },

    {
      $project: {
        data: 1,
        meta: { $ifNull: [{ $arrayElemAt: ["$meta", 0] }, {}] },
      },
    },
  ];

  const result = await Promotion.aggregate(pipeline).allowDiskUse(true);
  return result[0] || { data: [], meta: {} };
};

module.exports = {
  getWithFilters,
};

// Count
const count = async (query = {}) => {
  return Promotion.countDocuments(query);
};

// Find by ID with population
const findById = async (id) => {
  return Promotion.findById(id)
    .populate("menuItem")
    .populate({ path: "tierLimit", select: "image title" })
    .exec();
};

// Update and save
const updateData = async (item, data) => {
  if (data.startTime !== undefined || data.endTime !== undefined) {
    const times = resolvePromotionTimes(data, item);
    data.startTime = times.startTime;
    data.endTime = times.endTime;
  }

  Object.assign(item, data);

  return await item.save();
};

// Delete
const deleteItem = async (item) => {
  return await item.deleteOne();
};

// findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  const existing = await Promotion.findById(id);
  if (!existing) return null;

  if (data.startTime !== undefined || data.endTime !== undefined) {
    const times = resolvePromotionTimes(data, existing);
    data.startTime = times.startTime;
    data.endTime = times.endTime;
  }

  return Promotion.findByIdAndUpdate(id, data, { new: true })
    .populate("menuItem")
    .populate("tierLimit");
};
const getPromotionsByCreator = async (creatorId) => {
  try {
    // Query the promotions table based on the creator ID
    const promotions = await Promotion.find({ companyOrganizer: creatorId });

    // Return promotions details or an empty array if none are found
    return promotions.length > 0 ? promotions : [];
  } catch (error) {
    return [];
  }
};

module.exports = {
  create,
  getWithFilters,
  count,
  findById,
  updateData,
  deleteItem,
  findByIdAndUpdate,
  getPromotionsByCreator,
  validatePromotionTimes,
  resolvePromotionTimes,
  timeToMinutes,
  isPromotionTimeActive,
  isPromotionDayActive,
  isPromotionRecurrenceActive,
  isPromotionScheduleActive,
};
