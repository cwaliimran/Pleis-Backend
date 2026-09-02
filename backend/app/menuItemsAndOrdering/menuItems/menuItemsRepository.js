// repositories/menuItemRepository.js
const MenuItems = require("@MenuItemsModel");
const { MenuItemsCombos } = require("@MenuItemsCombosModel");
const { MenuItemsDiscounts } = require("@MenuItemsDiscountsModel");
const { resolveEffectiveDiscount } = require("@MenuItemsDiscountsModel");
const Menus = require("@MenusModel");
const mongoose = require("mongoose");
const MenuOrders = require("@OrdersModel");
const { getActiveMenuItemPromotions, getActiveMenuItemProductSales, getActiveMenuHappyHourPromotion } = require("../../loyalty/promotions/promotionsRepository");
const { getCurrentDateInTimezone, getStartAndEndOfDay } = require("@utils/responseUtil");
const { getAllDayparts } = require("../../../admin/presetMenu/daypart/daypartRepository");
const {
  filterByDaypartAndDays,
  filterByDaypartAndDaysWithFetch,
} = require("../../../shared/menuItemsFilters/filterByDaypartAndDays");

const pickBestDiscount = (discounts = [], basePrice = 0, at = new Date()) =>
  resolveEffectiveDiscount(discounts, basePrice, at);

const getActiveMenuItemDiscounts = async (menuItemIds = [], timezone = null) => {
  if (!menuItemIds.length) return [];

  // Get the current date and time in the user's timezone
  const now = getCurrentDateInTimezone({ timezone, isDateOnly: false });

  // Find discounts that have already started and not yet ended (active at 'now')
  // startDate <= now <= endDate
  // If a discount's startDate is in the future (startDate > now), it will NOT be matched and thus not shown.
  return MenuItemsDiscounts.find({
    status: "active",
    startDate: { $lte: now },
    endDate: { $gte: now },
    menuItems: { $in: menuItemIds },
  })
    .select("name type value startDate endDate menuItems status createdAt")
    .lean();
};

const attachMenuItemDiscounts = (menuItems = [], discounts = [], at = new Date()) => {
  const discountMap = new Map();

  discounts.forEach((discount) => {
    (discount.menuItems || []).forEach((menuItemId) => {
      const key = menuItemId.toString();
      if (!discountMap.has(key)) {
        discountMap.set(key, []);
      }
      discountMap.get(key).push({
        _id: discount._id,
        name: discount.name,
        type: discount.type,
        value: discount.value,
        startDate: discount.startDate,
        endDate: discount.endDate,
        status: discount.status,
        createdAt: discount.createdAt,
      });
    });
  });

  return menuItems.map((item) => ({
    ...item,
    discount: pickBestDiscount(discountMap.get(item._id.toString()), item.basePrice, at),
  }));
};

const getPromotionMenuItemIds = (promo) => {
  const raw = promo?.menuItem;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((menuItem) => (menuItem?._id || menuItem)?.toString?.())
    .filter(Boolean);
};

const toItemPromotion = (promo) => {
  if (!promo) return null;

  return {
    _id: promo._id,
    title: promo.title,
    description: promo.description || "",
    image: promo.image,
    promotionType: promo.promotionType,
    extraPoints: Number(promo.extraPoints) || 0,
    startDate: promo.startDate,
    endDate: promo.endDate,
    startTime: promo.startTime ?? null,
    endTime: promo.endTime ?? null,
    status: promo.status,
  };
};

const isBetterPromotion = (candidate, current) => {
  if (!current) return true;

  const candidatePoints = Number(candidate?.extraPoints) || 0;
  const currentPoints = Number(current?.extraPoints) || 0;
  if (candidatePoints !== currentPoints) return candidatePoints > currentPoints;

  return new Date(candidate?.createdAt || 0) > new Date(current?.createdAt || 0);
};

const buildPromotionMap = (promotions = []) => {
  const promotionMap = new Map();

  promotions.forEach((promo) => {
    getPromotionMenuItemIds(promo).forEach((id) => {
      const existing = promotionMap.get(id);
      if (isBetterPromotion(promo, existing)) {
        promotionMap.set(id, promo);
      }
    });
  });

  return promotionMap;
};

const attachMenuItemPromotions = (menuItems = [], promotions = [], { slim = false } = {}) => {
  const promotionMap = buildPromotionMap(promotions);

  return menuItems.map((item) => {
    const promo = promotionMap.get(item._id.toString()) || null;
    if (!slim) {
      return {
        ...item,
        promotion: promo,
      };
    }

    const payload = toItemPromotion(promo);
    return {
      ...item,
      promotion: payload,
      extraPoints: payload?.extraPoints ?? null,
    };
  });
};

const toDiscountFromProductSale = (promo, timezone = "UTC") => {
  const { start } = promo.startDate
    ? getStartAndEndOfDay(promo.startDate, timezone)
    : { start: promo.startDate };
  const { end } = promo.endDate
    ? getStartAndEndOfDay(promo.endDate, timezone)
    : { end: promo.endDate };

  return {
    _id: promo._id,
    name: promo.title,
    type: "percentage",
    value: Number(promo.discountedPercent) || 0,
    startDate: start,
    endDate: end,
    status: promo.status,
    createdAt: promo.createdAt,
    menuItems: getPromotionMenuItemIds(promo),
  };
};

const toItemHappyHour = (promo) => {
  if (!promo) return null;

  return {
    _id: promo._id,
    title: promo.title,
    description: promo.description || "",
    image: promo.image,
    promotionType: "happyHour",
    pointsMultiplier: Number(promo.pointsMultiplier) || 1,
    startDate: promo.startDate,
    endDate: promo.endDate,
    startTime: promo.startTime ?? null,
    endTime: promo.endTime ?? null,
    status: promo.status,
  };
};

const attachActiveMenuItemOffers = async (
  menuItems = [],
  { userId = null, timezone = null, companyOrganizer = null } = {},
) => {
  if (!menuItems.length) return menuItems;

  const organizerId = companyOrganizer || menuItems[0]?.creator || null;
  const menuItemIds = menuItems.map((item) => item._id);
  const [discounts, promotions, productSales, happyHour] = await Promise.all([
    getActiveMenuItemDiscounts(menuItemIds, timezone),
    getActiveMenuItemPromotions({ menuItemIds, userId, timezone }),
    getActiveMenuItemProductSales({ menuItemIds, timezone }),
    getActiveMenuHappyHourPromotion({ companyOrganizer: organizerId, timezone }),
  ]);

  const saleDiscounts = productSales.map((promo) =>
    toDiscountFromProductSale(promo, timezone || "UTC"),
  );
  const happyHourPayload = toItemHappyHour(happyHour);
  const now = timezone
    ? getCurrentDateInTimezone({ timezone, isDateOnly: false })
    : new Date();

  return attachMenuItemPromotions(
    attachMenuItemDiscounts(menuItems, [...discounts, ...saleDiscounts], now),
    promotions,
    { slim: true },
  ).map((item) => ({
    ...item,
    happyHour: happyHourPayload,
  }));
};

const getMenuItemsWithFilters = async ({ query = {}, userId = null, timezone = null }) => {
  let menuItems = await MenuItems.aggregate([
    {
      $match: {
        ...query,
        status: query.status || "active",
        isAvailableInStock: true,
      },
    },
    ...buildMenuItemsSaleLookup(timezone),
    { $sort: { createdAt: -1 } },
  ]);

  if (!menuItems.length) return [];

  // Same availability rules as V2: daypart + availableDays in org/user timezone
  menuItems = await filterByDaypartAndDaysWithFetch(
    menuItems,
    getAllDayparts,
    timezone || "UTC",
  );

  if (!menuItems.length) return [];

  // Same V2 discounts / product sales used by menu fetch, so order pricing matches the menu.
  return attachActiveMenuItemOffers(menuItems, { userId, timezone });
};

const getMenuItemsWithFiltersV2 = async ({ query = {}, timezone = null, userId = null }) => {
  let menuItems = await MenuItems.aggregate([
    {
      $match: {
        ...query,
        status: "active",
        isAvailableInStock: true,
      },
    },
    {
      $lookup: {
        from: "menusubcategories",
        localField: "subCategory",
        foreignField: "_id",
        pipeline: [{ $match: { status: "active" } }, { $project: { _id: 1 } }],
        as: "subCategoryInfo",
      },
    },
    { $match: { subCategoryInfo: { $ne: [] } } },
    { $project: { subCategoryInfo: 0 } },
    { $sort: { createdAt: -1 } },
  ]);
  if (!menuItems.length) return [];


  menuItems = await filterByDaypartAndDaysWithFetch(menuItems, getAllDayparts, timezone || "UTC");

  return attachActiveMenuItemOffers(menuItems, { userId, timezone });
};
const buildMenuItemsSaleLookup = (timezone = null) => {
  // Prefer user-local "now" when timezone is known; fall back to server UTC.
  const now = timezone ? getCurrentDateInTimezone({ timezone, isDateOnly: false }) : new Date();

  return [
    {
      $lookup: {
        from: "menuitemssales",
        let: { menuItemId: "$_id" },
        pipeline: [
          {
            $match: {
              status: "active",
              startDateTime: { $lte: now },
              endDateTime: { $gte: now },
            },
          },
          {
            $match: {
              $expr: {
                $in: ["$$menuItemId", "$menuItems"],
              },
            },
          },
          { $sort: { discountValue: -1 } },
          { $limit: 1 },
        ],
        as: "sale",
      },
    },
    {
      $unwind: {
        path: "$sale",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        saleDiscountType: "$sale.discountType",
        saleDiscountValue: "$sale.discountValue",
      },
    },
  ];
};

const getOrganizationIdByMenuItemId = async (menuId) => {
  const menu = await Menus.findById(menuId).select("organization");
  if (!menu || !menu.organization) throw new Error("Menu item or menu not found");
  return menu.organization;
};

const getOrganizationIdFromMenuItem = async (menuItemId) => {
  const menuItem = await MenuItems.findById(menuItemId).select("menu").lean();
  if (!menuItem?.menu) throw new Error("Menu item or menu not found");
  return getOrganizationIdByMenuItemId(menuItem.menu);
};

//recommended items
//fetch item and its category, type then fetch relevant items based on category and type

// Count by condition
const countMenuItems = async (query = {}) => {
  return MenuItems.countDocuments(query);
};

// Find by ID
const findMenuItemById = async (id, userId = null, timezone = null) => {
  const result = await MenuItems.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },
    ...buildMenuItemsSaleLookup(timezone),
  ]);

  const item = result[0] || null;
  if (!item) return null;

  if (!userId) return item;

  const promotions = await getActiveMenuItemPromotions({
    menuItemIds: [item._id],
    userId,
    timezone,
  });

  const [itemWithPromotion] = attachMenuItemPromotions([item], promotions);
  return itemWithPromotion;
};

const findMenuItemByIdV2 = async (id, userId = null, timezone = null) => {
  // get menu item details v2, apply getActiveMenuItemDiscounts, and populate all v2 fields
  const item = await MenuItems.findById(id)
    .populate({
      path: "presetType",
      select: "name code status image description",
    })
    .populate({
      path: "brand",
      select: "name brandOwner status",
    })
    .populate({
      path: "servingSize",
      select: "type code unit status level2",
    })
    .populate({
      path: "daypart",
      select: "name code status startTime endTime isAllDay",
    })
    .populate({
      path: "dietTags",
      select: "name code status description",
    })
    .populate({
      path: "allergens",
      select: "name code status",
    })
    .lean();

  if (!item) return null;

  const [itemWithOffers] = await attachActiveMenuItemOffers([item], { userId, timezone });
  return itemWithOffers;
};

const getMenuIdByOrganization = async (organizationId) => {
  return await Menus.find({
    organization: new mongoose.Types.ObjectId(organizationId),
    status: "active",
    isOrderingEnabled: true,
  })
    .select("_id")
    .sort({ createdAt: -1 });
};

// Recommended items
// Fetch item and its category/type, then get similar items

const getRecommendedItems = async (menuItemId, userId = null, timezone = null, limit = 10) => {
  const menuItem = await MenuItems.findById(menuItemId).lean();
  if (!menuItem) throw new Error("Menu item not found");

  const items = await MenuItems.aggregate([
    {
      $match: {
        _id: { $ne: new mongoose.Types.ObjectId(menuItemId) },
        menu: menuItem.menu,
        status: "active",
        category: menuItem.category,
        isAvailableInStock: true,
        type: { $regex: menuItem.type, $options: "i" },
      },
    },
    ...buildMenuItemsSaleLookup(timezone),
    { $sort: { createdAt: -1 } },
    { $limit: limit },
  ]);

  if (!items.length || !userId) return items;

  const menuItemIds = items.map((item) => item._id);

  const promotions = await getActiveMenuItemPromotions({
    menuItemIds,
    userId,
    timezone,
  });

  return attachMenuItemPromotions(items, promotions);
};

//userId, timezone, organization, menuId
const getRecommendedItemsV2 = async (userId = null, timezone = null, menuIds = []) => {
  const menuObjectIds = (Array.isArray(menuIds) ? menuIds : [menuIds])
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id._id || id));

  if (!menuObjectIds.length) return [];

  let items = await MenuItems.find({
    menu: { $in: menuObjectIds },
    status: "active",
    isAvailableInStock: true,
    isRecommended: true,
  }).lean();

  if (!items.length) return [];

  items = await filterByDaypartAndDaysWithFetch(
    items,
    getAllDayparts,
    timezone || "UTC",
  );

  if (!items.length) return [];

  return attachActiveMenuItemOffers(items, { userId, timezone });
};

// userId, timezone, organization, menuId
const getUpsellMenuItemsV2 = async (userId = null, timezone = null, menuIds = []) => {
  const menuObjectIds = (Array.isArray(menuIds) ? menuIds : [menuIds])
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id._id || id));

  if (!menuObjectIds.length) return [];

  let items = await MenuItems.find({
    menu: { $in: menuObjectIds },
    status: "active",
    isAvailableInStock: true,
    upSellItem: true,
  }).lean();

  if (!items.length) return [];

  items = await filterByDaypartAndDaysWithFetch(
    items,
    getAllDayparts,
    timezone || "UTC",
  );

  if (!items.length) return [];

  return attachActiveMenuItemOffers(items, { userId, timezone });
};

// ----------------------
// HYBRID RECOMMENDER (ORG-BASED)
// ----------------------
const getOrganizationHybridRecommendedItems = async (userId, timezone, organizationId, limit = 10) => {
  // 1. Find active menu
  const menu = await Menus.findOne({
    organization: organizationId,
    status: "active",
    isOrderingEnabled: true,
  }).select("_id");

  if (!menu) return [];

  // 2. Fetch active menu items
  const menuItems = await MenuItems.aggregate([
    {
      $match: {
        menu: menu._id,
        status: "active",
        isAvailableInStock: { $ne: false },
      },
    },
    ...buildMenuItemsSaleLookup(timezone),
  ]);

  if (!menuItems.length) return [];

  /* -------------------------------
     PURCHASE HISTORY
  ------------------------------- */

  const orders = await MenuOrders.find({ user: userId }).select("items").lean();

  const frequencyMap = {};

  for (const order of orders) {
    for (const item of order.items) {
      const itemId = String(item.menuItem);
      if (!frequencyMap[itemId]) frequencyMap[itemId] = 0;
      frequencyMap[itemId] += item.quantity;
    }
  }

  /* -------------------------------
     TOKENIZER
  ------------------------------- */

  const tokenize = (str) =>
    str
      .toLowerCase()
      .split(/[\s,.-]+/)
      .filter(Boolean);

  /* -------------------------------
     BUILD SCORES
  ------------------------------- */

  const results = menuItems.map((item) => {
    const words = tokenize(item.title);

    let textScore = 0;

    menuItems.forEach((other) => {
      if (other._id.toString() === item._id.toString()) return;

      tokenize(other.title).forEach((w) => {
        if (words.includes(w)) textScore++;
      });
    });

    const purchaseScore = frequencyMap[item._id.toString()] || 0;

    return {
      ...item,
      _score: purchaseScore * 2 + textScore,
    };
  });

  /* -------------------------------
     SORT
  ------------------------------- */

  const sortedItems = results
    .sort((a, b) => {
      if (a.upSellItem && !b.upSellItem) return -1;
      if (!a.upSellItem && b.upSellItem) return 1;
      return b._score - a._score;
    })
    .slice(0, limit);

  /* -------------------------------
     PROMOTIONS
  ------------------------------- */

  if (!userId) return sortedItems;

  const menuItemIds = sortedItems.map((item) => item._id);

  const promotions = await getActiveMenuItemPromotions({
    menuItemIds,
    userId,
    timezone,
  });

  return attachMenuItemPromotions(sortedItems, promotions);
};

const comboMenuItemLookupPipeline = [
  {
    $lookup: {
      from: "dayparts",
      localField: "daypart",
      foreignField: "_id",
      as: "daypart",
      pipeline: [
        {
          $project: {
            name: 1,
            code: 1,
            status: 1,
            startTime: 1,
            endTime: 1,
            isAllDay: 1,
          },
        },
      ],
    },
  },
  {
    $lookup: {
      from: "allergens",
      localField: "allergens",
      foreignField: "_id",
      as: "allergens",
      pipeline: [{ $project: { name: 1, code: 1, status: 1 } }],
    },
  },
  {
    $project: {
      title: 1,
      status: 1,
      basePrice: 1,
      image: 1,
      daypart: 1,
      allergens: 1,
      availableDays: 1,
      category: 1,
      type: 1,
    },
  },
];

const getMenuItemsCombosWithFilters = async ({ query = {} } = {}) => {
  return MenuItemsCombos.find({ ...query, status: "active" })
    .select("name description subCategory priceMode price status menuItems creator")
    .populate("subCategory", "name status category")
    .lean();
};

const getMenuItemsCombos = async (
  menuItems = [],
  companyOrganizer = null,
  timezone = "UTC",
) => {
  if (!menuItems.length || !companyOrganizer) return [];

  const effectiveTimezone = timezone || "UTC";
  const allDayparts = await getAllDayparts();
  const daypartMap = new Map(allDayparts.map((d) => [d._id.toString(), d]));

  const normalizeTitle = (title = "") => String(title).trim().toLowerCase();

  const itemsByTitle = new Map();
  for (const item of menuItems) {
    const key = normalizeTitle(item.title);
    if (!key) continue;
    if (!itemsByTitle.has(key)) itemsByTitle.set(key, []);
    itemsByTitle.get(key).push(item);
  }

  if (!itemsByTitle.size) return [];

  const creatorId = new mongoose.Types.ObjectId(companyOrganizer);

  const combos = await MenuItemsCombos.aggregate([
    {
      $match: {
        status: "active",
        creator: creatorId,
      },
    },
    {
      $lookup: {
        from: "menusubcategories",
        localField: "subCategory",
        foreignField: "_id",
        as: "subCategory",
        pipeline: [{ $project: { title: 1, status: 1 } }],
      },
    },
    {
      $unwind: {
        path: "$subCategory",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "menuitems",
        localField: "menuItems.menuItem",
        foreignField: "_id",
        as: "_templateItems",
        pipeline: [{ $project: { title: 1, status: 1 } }],
      },
    },
    {
      $addFields: {
        _componentTitles: {
          $map: {
            input: "$menuItems",
            as: "mi",
            in: {
              quantity: "$$mi.quantity",
              title: {
                $let: {
                  vars: {
                    doc: {
                      $first: {
                        $filter: {
                          input: "$_templateItems",
                          as: "t",
                          cond: { $eq: ["$$t._id", "$$mi.menuItem"] },
                        },
                      },
                    },
                  },
                  in: "$$doc.title",
                },
              },
            },
          },
        },
      },
    },
    {
      $project: {
        name: 1,
        description: 1,
        subCategory: 1,
        priceMode: 1,
        price: 1,
        status: 1,
        creator: 1,
        createdAt: 1,
        _componentTitles: 1,
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  const applicable = [];

  for (const combo of combos) {
    const components = combo._componentTitles || [];
    if (components.length < 2) continue;

    const resolvedItems = [];
    let canApply = true;

    for (const component of components) {
      const titleKey = normalizeTitle(component.title);
      const matches = titleKey ? itemsByTitle.get(titleKey) : null;
      if (!matches?.length) {
        canApply = false;
        break;
      }
      // Prefer an unused item of the same title when quantity > 1 components share a name
      resolvedItems.push({
        ...matches[0],
        _comboQuantity: component.quantity || 1,
      });
    }

    if (!canApply || resolvedItems.length < 2) continue;

    if (combo.subCategory?.status && combo.subCategory.status !== "active") {
      continue;
    }

    const availableComponents = filterByDaypartAndDays(
      resolvedItems,
      daypartMap,
      effectiveTimezone,
    );
    if (availableComponents.length !== resolvedItems.length) continue;

    applicable.push({
      _id: combo._id,
      name: combo.name,
      description: combo.description,
      subCategory: combo.subCategory,
      priceMode: combo.priceMode,
      price: combo.price,
      status: combo.status,
      creator: combo.creator,
      menuItems: resolvedItems.map((item) => {
        const { _comboQuantity, ...rest } = item;
        return {
          ...rest,
          quantity: _comboQuantity || 1,
        };
      }),
    });
  }

  return applicable;
};

module.exports = {
  getMenuItemsWithFilters,
  getMenuItemsWithFiltersV2,
  getActiveMenuItemDiscounts,
  attachMenuItemDiscounts,
  countMenuItems,
  findMenuItemById,
  findMenuItemByIdV2,
  getMenuIdByOrganization,
  getRecommendedItems,
  getRecommendedItemsV2,
  getOrganizationHybridRecommendedItems,
  getOrganizationIdByMenuItemId,
  getOrganizationIdFromMenuItem,
  buildMenuItemsSaleLookup,
  getUpsellMenuItemsV2,
  getMenuItemsCombos,
  getMenuItemsCombosWithFilters,
};
