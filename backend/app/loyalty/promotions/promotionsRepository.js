const { default: mongoose } = require("mongoose");
const {
  Promotion,
  PromotionsOrders,
} = require("../../../commonModules/loyalty/promotions/models/Promotion");

const { buildKeywordQueryFromModels } =
  require("@dbUtils/queryUtil");

const clubMemberRepo = require("../clubMembers/clubMembersRepository");
const { formatUserWallet } = require("../clubMembers/formatters/formatUserWallet");
// const formatPromotion = require("./utils/formatPromotion");
const { generateMeta } = require("@utils/responseUtil");
const formatPromotion = require("./formatters/formatPromotion");
const { normalizePromotionClaimMeta } = require("./formatters/normalizePromotionClaimMeta");
const { createTransaction } = require("../../userWalletService/transactions/services/unifiedTransactionsService");


// Count
const count = async (query = {}) => {
  return Promotion.countDocuments(query);
};

// Find by ID with population
const findById = async ({
  id,
  userId,
  timezone,
  now,
}) => {
  const promotion = await Promotion.findById(id)
    .populate("menuItem")
    .populate("tierLimit")
    .populate({
      path: "companyOrganizer",
      select: "companyDetails.loyaltySettings.title companyDetails.logo",
    })
    .populate({
      path: "reward",
      select: "title description image rewardType points ticket event menuItem",
    })
    .lean();

  if (!promotion) return null;

  const items = await applyPromotionEligibility({
    promotions: [promotion],
    userId,
    timezone,
    now,
  });

  return items[0] || null;
};



const getPromotionsByCompanyOrganizer = async ({
  skip,
  limit,
  now,
  companyOrganizer,
  userId,
  timezone,
}) => {
  const match = {
    status: "active",
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    endDate: { $gte: now },
  };

  const promotions = await Promotion.find(match)
    .populate({
      path: "companyOrganizer",
      select:
        "companyDetails.loyaltySettings.title companyDetails.logo",
    })
    .populate("menuItem")
    .populate("tierLimit")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();

  if (!promotions.length) {
    return [];
  }

  const items = await applyPromotionEligibility({
    promotions,
    userId,
    timezone,
    now,
  });

  return items;
};


const getPromotionsForDashboard = async ({
  userId,
  timezone,
  page = 1,
  limit = 10,
}) => {
  const now = new Date();
  const skip = (page - 1) * limit;

  /* ===============================
     1️⃣ Clubs user follows
  =============================== */
  const clubIds =
    await clubMemberRepo.getFollowedClubIds(userId);

  if (!clubIds.length) {
    return { items: [], meta: generateMeta(page, limit, 0) };
  }

  const matchQuery = {
    companyOrganizer: { $in: clubIds },
    status: "active",
    $or: [
      { startDate: null, endDate: null },
      {
        startDate: { $lte: now },
        endDate: { $gte: now },
      },
    ],
  };

  /* ===============================
     2️⃣ Total count BEFORE pagination
  =============================== */
  const total = await Promotion.countDocuments(matchQuery);

  if (!total) {
    return { items: [], meta: generateMeta(page, limit, 0) };
  }

  /* ===============================
     3️⃣ Fetch paginated promotions
  =============================== */
  const promotions = await Promotion.find(matchQuery)
    .populate("tierLimit")
    .populate(
      "companyOrganizer",
      "companyDetails.loyaltySettings.title companyDetails.logo"
    )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  /* ===============================
     4️⃣ Eligibility normalization
  =============================== */
  const items = await applyPromotionEligibility({
    promotions,
    userId,
    timezone,
    now,
  });

  /* ===============================
     5️⃣ Sort claimable first
  =============================== */
  items.sort((a, b) => {
    if (a.canClaim && !b.canClaim) return -1;
    if (!a.canClaim && b.canClaim) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  /* ===============================
     6️⃣ Correct meta
  =============================== */
  return {
    items,
    meta: generateMeta(page, limit, total),
  };
};


const getPromotionClaimCounts = async (
  userId,
  promotions
) => {
  if (!promotions?.length) return new Map();

  const promotionIds = promotions.map(p => p._id);

  const orders = await PromotionsOrders.find(
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




const applyPromotionEligibility = async ({
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

  /* ---------- Organizer IDs ---------- */
  const organizerIds = [
    ...new Set(
      promotions
        .map(p => p.companyOrganizer?._id)
        .filter(Boolean)
        .map(String)
    ),
  ];

  /* ---------- Bulk wallet fetch ---------- */
  const [wallets, claimMap] = await Promise.all([
    clubMemberRepo.getWalletsBulk(userId, organizerIds),
    getPromotionClaimCounts(userId, promotions),
  ]);

  const walletMap = new Map();

  wallets.forEach(w => {
    if (!w) return;

    const fw = formatUserWallet(w);
    if (!fw?.companyOrganizer) return;

    walletMap.set(
      String(fw.companyOrganizer),
      fw
    );
  });

  /* ---------- Normalize promotions ---------- */
  const items = [];

  for (const promo of promotions) {
    const organizerId =
      promo.companyOrganizer?._id
        ? String(promo.companyOrganizer._id)
        : null;

    const wallet = organizerId
      ? walletMap.get(organizerId)
      : null;

    const formatted = formatPromotion(
      promo,
      timezone,
      wallet?.tierKey
    );

    if (!wallet) {
      items.push(formatted);
      continue;
    }

    const claimedCount =
      claimMap.get(String(promo._id)) || 0;

    const meta = normalizePromotionClaimMeta({
      promotion: formatted,
      claimedCount,
      userPoints: wallet.points ?? 0,
      userTierEntry:
        wallet.level?.entryPoints ?? 0,
      now,
    });

    items.push({
      ...formatted,
      ...meta,
    });
  }

  return items;
};


const getPromotionsForHome = async ({
  userId,
  page = 1,
  limit = 11,
  timezone,
  now,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    {
      $match: {
        status: "active",
        endDate: { $gte: now },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        as: "companyOrganizer",
        pipeline: [
          {
            $project: {
              _id: 1,
              "companyDetails.logo": 1,
              "companyDetails.loyaltySettings.title": 1,
            },
          },
        ],
      },
    },
    { $unwind: { path: "$companyOrganizer", preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: "tiers",
        localField: "tierLimit",
        foreignField: "_id",
        as: "tierLimit",
      },
    },
    { $unwind: { path: "$tierLimit", preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: "menuitems",
        localField: "menuItem",
        foreignField: "_id",
        as: "menuItem",
      },
    },
    { $unwind: { path: "$menuItem", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "rewards",
        localField: "reward",
        foreignField: "_id",
        as: "reward",
      },
    },
    { $unwind: { path: "$reward", preserveNullAndEmptyArrays: true } },

    { $sort: { createdAt: -1 } },

    {
      $facet: {
        data: [
          { $skip: skip },
          ...(limit === 0 ? [] : [{ $limit: limit }]),
        ],
        totalFiltered: [{ $count: "count" }],
      },
    },
  ];

  const result = await Promotion.aggregate(pipeline);

  const records = result[0]?.data || [];
  const totalFiltered =
    result[0]?.totalFiltered[0]?.count || 0;

  const items = await applyPromotionEligibility({
    promotions: records,
    userId,
    timezone,
    now,
  });

  return {
    promotions: items,
    meta: generateMeta(page, limit, totalFiltered),
  };
};


const getPromotions = async ({
  userId,
  page = 1,
  limit = 10,
  keyword,
  timezone,
  now,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    {
      $match: {
        status: "active",
        endDate: { $gte: now },
      },
    },
  ];

  const keywordMatch =
    buildKeywordQueryFromModels(
      [{ schema: Promotion.schema }],
      keyword
    );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }

  pipeline.push({
    $lookup: {
      from: "users",
      localField: "companyOrganizer",
      foreignField: "_id",
      as: "companyOrganizer",
      pipeline: [
        {
          $project: {
            _id: 1,
            "companyDetails.loyaltySettings.title": 1,
            "companyDetails.logo": 1,
          },
        },
      ],
    },
  });

  pipeline.push({
    $unwind: {
      path: "$companyOrganizer",
      preserveNullAndEmptyArrays: true,
    },
  });


  pipeline.push({
    $lookup: {
      from: "tiers",
      localField: "tierLimit",
      foreignField: "_id",
      as: "tierLimit",
    },
  });

  pipeline.push({
    $unwind: {
      path: "$tierLimit",
      preserveNullAndEmptyArrays: true,
    },
  });

  //populate reward
  pipeline.push({
    $lookup: {
      from: "rewards",
      localField: "reward",
      foreignField: "_id",
      as: "reward",
    },
  });

  pipeline.push({
    $unwind: {
      path: "$reward",
      preserveNullAndEmptyArrays: true,
    },
  });

  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }]),
      ],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Promotion.aggregate(pipeline);

  const records = result[0]?.data || [];
  const totalFiltered =
    result[0]?.totalFiltered[0]?.count || 0;

  const promotions =
    await applyPromotionEligibility({
      promotions: records,
      userId,
      timezone,
      now,
    });

  return {
    promotions,
    meta: generateMeta(page, limit, totalFiltered),
  };
};

const getActiveLoyaltyHappyHourPromotion = async ({
  companyOrganizer,
  userId,
  userTierEntryPoints = 0,
  now = new Date(),
}) => {
  if (!companyOrganizer || !userId) return null;

  const organizerId = new mongoose.Types.ObjectId(companyOrganizer);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [promotion] = await Promotion.aggregate([
    {
      $match: {
        promotionType: "happyHour",
        status: "active",
        companyOrganizer: organizerId,
        startDate: { $lte: now },
        endDate: { $gte: now },
      },
    },

    {
      $lookup: {
        from: "tiers",
        localField: "tierLimit",
        foreignField: "_id",
        as: "tierLimit",
      },
    },
    { $unwind: "$tierLimit" },

    {
      $match: {
        $expr: {
          $lte: ["$tierLimit.entryPoints", userTierEntryPoints],
        },
      },
    },

    {
      $lookup: {
        from: "promotionorders",
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
          $ifNull: [{ $arrayElemAt: ["$claimStats.userClaims", 0] }, 0],
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

  return promotion || null;
};

const claimPromotion = async (promotionId, userId) => {
  const now = new Date();

  /* ---------------- Fetch promotion ---------------- */
  const promotion = await Promotion.findById(promotionId)
    .populate("tierLimit")
    .populate("menuItem")
    .populate({
      path: "companyOrganizer",
      select:
        "companyDetails.loyaltySettings.title companyDetails.logo",
    })
    .lean();

  if (!promotion) {
    throw new Error("Promotion not found");
  }

  if (promotion.status !== "active") {
    throw new Error("Promotion is not active");
  }

  /* ---------------- Eligibility normalization ---------------- */
  const [eligiblePromo] =
    await applyPromotionEligibility({
      promotions: [promotion],
      userId,
      timezone: "UTC",
      now,
    });

  if (!eligiblePromo) {
    throw new Error("Promotion not eligible");
  }

  if (!eligiblePromo.canClaim) {
    throw new Error(
      eligiblePromo.claimError ||
      "Promotion cannot be claimed"
    );
  }

  /* ---------------- Create claim ---------------- */
  const order = await PromotionsOrders.create({
    promotion: promotionId,
    promotionType: promotion.promotionType,
    companyOrganizer: promotion.companyOrganizer._id,
    pointsSpent: promotion.claimPoints || 0,
    user: userId,
    status: "claimed",
    claimedAt: now,
  });

  //create transaction

  await createTransaction(
    {
      user: userId,
      companyOrganizer: promotion.companyOrganizer._id,
      type: "redeem",
      domainType: "promotionorders",
      entityId: order._id,
      companyPoints: {
        base: promotion.claimPoints || 0,
        total: -(promotion.claimPoints || 0)
      },
      description: `Promotion reward ${promotion.title}`
    },
    null
  );

  return order;
};


module.exports = {
  count,
  findById,
  getPromotionsByCompanyOrganizer,
  getPromotionsForDashboard,
  getPromotionsForHome,
  getPromotions,
  getActiveLoyaltyHappyHourPromotion,
  claimPromotion

};

