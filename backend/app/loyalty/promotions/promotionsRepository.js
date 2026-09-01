const { default: mongoose } = require("mongoose");
const MenuItems = require("@MenuItemsModel");
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
const { createTransactionService } = require("../../userWalletService/transactions/services/unifiedTransactionsService");
const {
  isPromotionScheduleActive,
  getPromotionScheduleReasons,
  getActivePromotionMatchQuery,
} = require("../../../commonModules/loyalty/promotions/utils/promotionSchedule");


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
  companyOrganizer,
}) => {
  const promotion = await Promotion.findById(id)
    .populate("menuItem")
    .populate("tierLimit")
    .populate({
      path: "companyOrganizer",
      select: "companyDetails.loyaltySettings.title companyDetails.logo",
    })
    .populate("reward")
    .lean();

  if (!promotion) return null;

  if (
    companyOrganizer &&
    String(promotion.companyOrganizer?._id) !== String(companyOrganizer)
  ) {
    return null;
  }

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
    ...getActivePromotionMatchQuery(timezone, now),
  };

  const promotions = await Promotion.find(match)
    .populate({
      path: "companyOrganizer",
      select:
        "companyDetails.loyaltySettings.title companyDetails.logo",
    })
    .populate("menuItem")
    .populate("tierLimit")
    .populate("reward")
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
    ...getActivePromotionMatchQuery(timezone, now),
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
    .populate("menuItem")
    .populate(
      "companyOrganizer",
      "companyDetails.loyaltySettings.title companyDetails.logo"
    )
    .populate("reward")
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
      timezone,
    });

    const scheduleReasons = getPromotionScheduleReasons(
      promo,
      now,
      timezone,
    );

    const cannotClaimReasons = [
      ...(meta.cannotClaimReasons || []),
      ...scheduleReasons,
    ];

    items.push({
      ...formatted,
      ...meta,
      cannotClaimReasons,
      canClaim: cannotClaimReasons.length === 0,
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
        ...getActivePromotionMatchQuery(timezone, now),
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
  companyOrganizer,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const baseMatch = {
    status: "active",
    ...getActivePromotionMatchQuery(timezone, now),
  };

  if (companyOrganizer) {
    baseMatch.companyOrganizer = new mongoose.Types.ObjectId(companyOrganizer);
  }

  const pipeline = [
    {
      $match: baseMatch,
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
          $match: { "companyDetails.status": "active" }  // Match only active companyDetails
        },
        {
          $project: {
            _id: 1,
            "companyDetails.loyaltySettings.title": 1,
            "companyDetails.logo": 1,
          }
        }
      ]
    }
  });

  pipeline.push({
    $unwind: {
      path: "$companyOrganizer",
      preserveNullAndEmptyArrays: true,
    },
  });
  pipeline.push({
    $match: {
      "companyOrganizer": { $ne: null }  // Ensure the companyOrganizer exists
    }
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

  //populate menu item
  pipeline.push({
    $lookup: {
      from: "menuitems",
      localField: "menuItem",
      foreignField: "_id",
      as: "menuItem",
    },
  });

  pipeline.push({
    $unwind: {
      path: "$menuItem",
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
  timezone = "UTC",
}) => {
  if (!companyOrganizer || !userId) return null;

  const organizerId = new mongoose.Types.ObjectId(companyOrganizer);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const promotions = await Promotion.aggregate([
    {
      $match: {
        promotionType: "happyHour",
        status: "active",
        companyOrganizer: organizerId,
        ...getActivePromotionMatchQuery(timezone, now),
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
    { $limit: 20 },

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

  for (const promotion of promotions) {
    if (isPromotionScheduleActive({ ...promotion, now, timezone })) {
      return promotion;
    }
  }

  return null;
};


const claimPromotion = async (promotionId, userId, timezone = "UTC") => {
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
    .populate("reward")
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
      timezone,
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

  await createTransactionService(
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


const getPromoMenuItemIds = (menuItem) => {
  if (!menuItem) return [];
  const list = Array.isArray(menuItem) ? menuItem : [menuItem];
  return list.map((item) => String(item?._id || item)).filter(Boolean);
};

const toObjectIds = (ids = []) =>
  [...new Set(ids.map((id) => String(id?._id || id)).filter(Boolean))]
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

const getMenuItemIdentityKey = (item) => {
  if (!item?.presetType || !item?.title) return null;
  return `${item.presetType}::${item.title}::${item.creator || ""}`;
};

/**
 * Menu items that share presetType + title + creator count as the same
 * promotion target. Returns expanded lookup ids and a map from any
 * equivalent id back to the originally requested menu item ids (so
 * attachMenuItemPromotions can still match the items being displayed).
 */
const getEquivalentMenuItemMatch = async (menuItemIds = []) => {
  const requestedIds = [...new Set(menuItemIds.map((id) => String(id)))];
  const equivalentToRequested = new Map();

  const addLink = (fromId, requestedId) => {
    const key = String(fromId);
    if (!equivalentToRequested.has(key)) equivalentToRequested.set(key, new Set());
    equivalentToRequested.get(key).add(String(requestedId));
  };

  if (!requestedIds.length) {
    return { lookupIds: [], equivalentToRequested };
  }

  const requestedItems = await MenuItems.find({ _id: { $in: requestedIds } })
    .select("_id presetType title creator")
    .lean();

  const lookupIds = new Set(requestedItems.map((item) => String(item._id)));
  const identityGroups = new Map();

  for (const item of requestedItems) {
    addLink(item._id, item._id);

    const key = getMenuItemIdentityKey(item);
    if (!key) continue;

    if (!identityGroups.has(key)) identityGroups.set(key, []);
    identityGroups.get(key).push(item);
  }

  if (identityGroups.size) {
    const siblingQueries = [...identityGroups.values()].map((group) => ({
      presetType: group[0].presetType,
      title: group[0].title,
      creator: group[0].creator,
    }));

    const siblings = await MenuItems.find({ $or: siblingQueries })
      .select("_id presetType title creator")
      .lean();

    for (const sibling of siblings) {
      lookupIds.add(String(sibling._id));
      const requestedGroup = identityGroups.get(getMenuItemIdentityKey(sibling)) || [];
      for (const requested of requestedGroup) {
        addLink(sibling._id, requested._id);
      }
    }
  }

  return {
    lookupIds: [...lookupIds],
    equivalentToRequested,
  };
};

const bindPromotionsToRequestedMenuItems = (promotions = [], equivalentToRequested) => {
  if (!promotions.length) return promotions;

  return promotions.map((promo) => {
    const promoItemIds = getPromoMenuItemIds(promo.menuItem);
    const requestedMatches = new Set();

    for (const id of promoItemIds) {
      const matches = equivalentToRequested.get(id);
      if (matches) matches.forEach((requestedId) => requestedMatches.add(requestedId));
    }

    const existing = new Set(promoItemIds);
    const missing = [...requestedMatches].filter((id) => !existing.has(id));
    if (!missing.length) return promo;

    if (Array.isArray(promo.menuItem)) {
      return {
        ...promo,
        menuItem: [...promo.menuItem, ...missing.map((id) => ({ _id: id }))],
      };
    }

    // Single linked item: retarget onto the requested item when there is only one
    if (missing.length === 1 && promo.menuItem && typeof promo.menuItem === "object") {
      return {
        ...promo,
        menuItem: { ...promo.menuItem, _id: missing[0] },
      };
    }

    const original = promo.menuItem ? [promo.menuItem] : [];
    return {
      ...promo,
      menuItem: [...original, ...missing.map((id) => ({ _id: id }))],
    };
  });
};

const getActiveMenuItemPromotions = async ({
  menuItemIds,
  userId,
  timezone,
  now = new Date()
}) => {

  if (!menuItemIds?.length) return [];

  const { lookupIds, equivalentToRequested } =
    await getEquivalentMenuItemMatch(menuItemIds);

  if (!lookupIds.length) return [];

  const promotions = await Promotion.find({
    promotionType: { $in: ["buyMenuItemPromotion", "extraPointsForItem"] },
    menuItem: { $in: toObjectIds(lookupIds) },
    status: "active",
    ...getActivePromotionMatchQuery(timezone || "UTC", now),
  })
    .populate("tierLimit")
    .populate("reward")
    .populate({ path: "menuItem", select: "_id title image" })
    .lean();

  if (!promotions.length) return [];

  const currentlyActive = promotions.filter((promo) =>
    isPromotionScheduleActive({ ...promo, now, timezone: timezone || "UTC" }),
  );

  if (!currentlyActive.length) return [];

  const formatted = await applyPromotionEligibility({
    promotions: currentlyActive,
    userId,
    timezone,
    now,
  });

  return bindPromotionsToRequestedMenuItems(formatted, equivalentToRequested);
};

const getActiveMenuItemProductSales = async ({
  menuItemIds,
  timezone,
  now = new Date(),
}) => {
  if (!menuItemIds?.length) return [];

  const { lookupIds, equivalentToRequested } =
    await getEquivalentMenuItemMatch(menuItemIds);

  if (!lookupIds.length) return [];

  const promotions = await Promotion.find({
    promotionType: "productSale",
    menuItem: { $in: toObjectIds(lookupIds) },
    status: "active",
    ...getActivePromotionMatchQuery(timezone || "UTC", now),
  })
    .select("title discountedPercent menuItem startDate endDate startTime endTime status createdAt activeDays recurringDetails")
    .lean();

  if (!promotions.length) return [];

  const currentlyActive = promotions.filter((promo) =>
    isPromotionScheduleActive({ ...promo, now, timezone: timezone || "UTC" }),
  );

  return bindPromotionsToRequestedMenuItems(currentlyActive, equivalentToRequested);
};

const getActiveMenuHappyHourPromotion = async ({
  companyOrganizer,
  timezone,
  now = new Date(),
}) => {
  if (!companyOrganizer) return null;

  const promotions = await Promotion.find({
    promotionType: "happyHour",
    status: "active",
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    ...getActivePromotionMatchQuery(timezone || "UTC", now),
  })
    .sort({ pointsMultiplier: -1 })
    .lean();

  if (!promotions.length) return null;

  const active = promotions.find((promo) =>
    isPromotionScheduleActive({ ...promo, now, timezone: timezone || "UTC" }),
  );

  if (!active) return null;

  return formatPromotion(active, timezone);
};

const awardMenuItemPromotionsForOrder = async ({
  userId,
  companyOrganizer,
  menuOrder,
  timezone,
}) => {
  const purchased = [];

  for (const item of menuOrder?.items || []) {
    if (!item?.menuItem || !item?.quantity) continue;
    purchased.push({
      menuItem: item.menuItem?._id || item.menuItem,
      quantity: Number(item.quantity),
    });
  }

  for (const combo of menuOrder?.combos || []) {
    const comboQty = Number(combo?.quantity) || 1;
    for (const item of combo?.items || []) {
      if (!item?.menuItem || !item?.quantity) continue;
      purchased.push({
        menuItem: item.menuItem?._id || item.menuItem,
        quantity: Number(item.quantity) * comboQty,
      });
    }
  }

  if (!purchased.length) return [];

  const { User } = require("@UserModel");
  let tz = timezone;
  if (!tz) {
    const user = await User.findById(userId).select("timezone").lean();
    tz = user?.timezone || "UTC";
  }

  const promotions = await getActiveMenuItemPromotions({
    menuItemIds: purchased.map((item) => item.menuItem),
    userId,
    timezone: tz,
  });

  const awarded = [];

  for (const promo of promotions) {
    if (!["buyMenuItemPromotion", "extraPointsForItem"].includes(promo.promotionType)) {
      continue;
    }
    if (promo.canClaim === false) continue;

    const organizerId = String(promo.companyOrganizer?._id || promo.companyOrganizer || "");
    if (companyOrganizer && organizerId && organizerId !== String(companyOrganizer)) {
      continue;
    }

    const promoItemIds = new Set(getPromoMenuItemIds(promo.menuItem));
    const qty = purchased.reduce((sum, item) => {
      const id = String(item.menuItem?._id || item.menuItem);
      return promoItemIds.has(id) ? sum + Number(item.quantity || 0) : sum;
    }, 0);
    if (qty <= 0) continue;

    const extra = (Number(promo.extraPoints) || 0) * qty;
    if (extra <= 0) continue;

    const order = await PromotionsOrders.create({
      promotion: promo._id,
      promotionType: promo.promotionType,
      companyOrganizer: companyOrganizer || promo.companyOrganizer?._id || promo.companyOrganizer,
      pointsSpent: 0,
      user: userId,
      status: "redeemed",
      redeemedAt: new Date(),
    });

    await createTransactionService(
      {
        user: userId,
        companyOrganizer: companyOrganizer || promo.companyOrganizer?._id || promo.companyOrganizer,
        organization: menuOrder?.organization?._id || menuOrder?.organization || null,
        type: "earn",
        domainType: "promotionorders",
        entityId: order._id,
        companyPoints: { base: extra, total: extra },
        description: `Menu item promotion ${promo.title}`,
      },
      null,
    );

    awarded.push({
      promotionId: String(promo._id),
      title: promo.title,
      extraPoints: extra,
      quantity: qty,
    });
  }

  return awarded;
};

module.exports = {
  count,
  findById,
  getPromotionsByCompanyOrganizer,
  getPromotionsForDashboard,
  getPromotionsForHome,
  getPromotions,
  getActiveLoyaltyHappyHourPromotion,
  claimPromotion,
  getActiveMenuItemPromotions,
  getActiveMenuItemProductSales,
  getActiveMenuHappyHourPromotion,
  awardMenuItemPromotionsForOrder,

};

