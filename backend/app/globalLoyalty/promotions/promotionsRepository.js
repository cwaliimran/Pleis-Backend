const {
  GlobalBasePromotion,
} = require(
  "../../../commonModules/globalLoyalty/promotions/models/Promotion"
);

const GlobalPromotionsOrders = require(
  "../../../commonModules/globalLoyalty/promotions/models/Promotion/GlobalPromotionsOrders"
);

const {
  PromotionEligibilityReasons,
} = require("./utils/promotionEligibility");

const formatPromotion = require("./utils/formatPromotion");

const {
  getUserWallet,
} = require(
  "../../userWalletService/global/walletManagement/userWalletService"
);

/* ==========================================================
   AGGREGATION FETCH
========================================================== */
const getWithFilters = async (
  query,
  skip = 0,
  limit = 20
) => {
  const pipeline = [
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
  ];

  if (limit > 0) pipeline.push({ $limit: limit });

  // Reward lookup for globalClaimPromotion from globalrewards collection
  pipeline.push({
    $lookup: {
      from: "globalrewards",
      localField: "reward",
      foreignField: "_id",
      as: "reward"
    }
  });

  // Reward lookup again for more detailed data from globalrewards collection
  pipeline.push({
    $lookup: {
      from: "globalrewards",         // Same collection for detailed data
      localField: "reward",          // Using the joined field from the first lookup
      foreignField: "_id",           // Matching based on the _id of globalrewards
      as: "rewardDetails"            // Store result in rewardDetails
    }
  });

  // Menu item lookup
  pipeline.push({
    $lookup: {
      from: "menuitems",
      localField: "menuItem",
      foreignField: "_id",
      as: "menuItem"
    }
  });

  // Tier limit lookup
  pipeline.push({
    $lookup: {
      from: "globalstatuslevels",
      localField: "tierLimit",
      foreignField: "_id",
      as: "tierLimit"
    }
  });

  // Flatten arrays into their respective single object fields
  pipeline.push({
    $addFields: {
      reward: { $arrayElemAt: ["$reward", 0] },          // Flatten reward array
      rewardDetails: { $arrayElemAt: ["$rewardDetails", 0] },  // Flatten rewardDetails array
      menuItem: { $arrayElemAt: ["$menuItem", 0] },      // Flatten menuItem array
      tierLimit: { $arrayElemAt: ["$tierLimit", 0] },    // Flatten tierLimit array
    }
  });

  // Return the aggregated data
  return await GlobalBasePromotion.aggregate(pipeline).allowDiskUse(true);
};


module.exports = {
  getWithFilters,
};

/* ==========================================================
   FIND BY ID
========================================================== */
const findById = async id =>
  GlobalBasePromotion.findById(id)
    .populate("menuItem")
    .populate({
      path: "tierLimit",
      select: "image title entryPoints",
    })
    .lean();

/* ==========================================================
   CLAIM COUNTS
========================================================== */
const getClaimCounts = async (
  userId,
  promotions
) => {
  if (!promotions?.length) return new Map();

  const promotionIds = promotions.map(
    p => p._id
  );

  const orders =
    await GlobalPromotionsOrders.find(
      {
        user: userId,
        promotion: { $in: promotionIds },
        status: { $in: ["claimed", "redeemed"] },
      },
      { promotion: 1, _id: 0 }
    ).lean();

  const counts = new Map();

  for (const order of orders) {
    const key = String(order.promotion);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return counts;
};

/* ==========================================================
   ELIGIBILITY ENGINE
========================================================== */
const applyEligibility = async ({
  promotions,
  userId,
  timezone,
  now,
}) => {
  if (!promotions?.length || !userId) {
    return promotions.map(p =>
      formatPromotion(p, timezone)
    );
  }

  const wallet =
    await getUserWallet(userId);

  const userPoints =
    wallet?.global?.points ?? 0;

  const userTierEntry =
    wallet?.global?.level?.entryPoints ?? 0;

  const claimMap =
    await getClaimCounts(
      userId,
      promotions
    );

  const items = [];

  for (const promo of promotions) {
    const formatted =
      formatPromotion(promo, timezone);

    const reasons = [];

    const claimedCount =
      claimMap.get(String(promo._id)) || 0;

    const claimLimit =
      formatted.claimLimit ?? 0;

    const tierRequired =
      formatted?.tierLimit?.entryPoints ?? 0;

    if (userTierEntry < tierRequired) {
      reasons.push(
        PromotionEligibilityReasons.TIER_NOT_ELIGIBLE
      );
    }

    if (
      claimLimit &&
      claimedCount >= claimLimit
    ) {
      reasons.push(
        PromotionEligibilityReasons.CLAIM_LIMIT_REACHED
      );
    }

    if (
      formatted.claimPoints &&
      userPoints <
        formatted.claimPoints
    ) {
      reasons.push(
        PromotionEligibilityReasons.INSUFFICIENT_POINTS
      );
    }

    if (formatted.status !== "active") {
      reasons.push(
        PromotionEligibilityReasons.PROMOTION_INACTIVE
      );
    }

    if (
      formatted.endDate &&
      new Date(formatted.endDate) < now
    ) {
      reasons.push(
        PromotionEligibilityReasons.PROMOTION_EXPIRED
      );
    }

    items.push({
      ...formatted,
      canClaim: reasons.length === 0,
      isClaimed: claimedCount > 0,
      claimRemaining: claimLimit
        ? Math.max(
            claimLimit - claimedCount,
            0
          )
        : null,
      cannotClaimReasons: reasons,
    });
  }

  return items;
};
const count = async (query = {}) => {
  return GlobalBasePromotion.countDocuments(query);
};


module.exports = {
  getWithFilters,
  count,
  findById,
  applyEligibility,
};
