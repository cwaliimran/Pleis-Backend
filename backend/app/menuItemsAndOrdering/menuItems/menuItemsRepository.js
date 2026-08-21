// repositories/menuItemRepository.js
const MenuItems = require("@MenuItemsModel");
const { MenuItemsCombos } = require("@MenuItemsCombosModel");
const { MenuItemsDiscounts } = require("@MenuItemsDiscountsModel");
const { resolveEffectiveDiscount } = require("@MenuItemsDiscountsModel");
const Menus = require("@MenusModel");
const mongoose = require("mongoose");
const MenuOrders = require("@OrdersModel");
const { getActiveMenuItemPromotions } = require("../../loyalty/promotions/promotionsRepository");
const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const { getAllDayparts } = require("../../../admin/presetMenu/daypart/daypartRepository");
const { filterByDaypartAndDaysWithFetch } = require("../../../shared/menuItemsFilters/filterByDaypartAndDays");

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

  /* --------------------------------
     If no user → skip promotion logic
  -------------------------------- */

  if (!userId) {
    return menuItems;
  }

  /* --------------------------------
     Collect menu item ids
  -------------------------------- */

  const menuItemIds = menuItems.map((item) => item._id);

  /* --------------------------------
     Fetch promotions
  -------------------------------- */

  const promotions = await getActiveMenuItemPromotions({
    menuItemIds,
    userId,
    timezone,
  });

  /* --------------------------------
     Map promotions by menuItemId
  -------------------------------- */

  const promotionMap = new Map();

  promotions.forEach((promo) => {
    if (!promo.menuItem) return;

    promotionMap.set(promo.menuItem._id.toString(), promo);
  });

  /* --------------------------------
     Attach promotion to menu items
  -------------------------------- */

  return menuItems.map((item) => ({
    ...item,
    promotion: promotionMap.get(item._id.toString()) || null,
  }));
};

const getMenuItemsWithFiltersV2 = async ({ query = {}, timezone = null }) => {
  //get day
  let menuItems = await MenuItems.aggregate([
    {
      $match: {
        ...query,
        status: "active",
        isAvailableInStock: true,
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  if (!menuItems.length) return [];

  menuItems = await filterByDaypartAndDaysWithFetch(menuItems, getAllDayparts, timezone || "UTC");

  const menuItemIds = menuItems.map((item) => item._id);
  const discounts = await getActiveMenuItemDiscounts(menuItemIds, timezone);

  return attachMenuItemDiscounts(menuItems, discounts);
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

  const promotion = promotions.find((p) => p.menuItem && p.menuItem._id.toString() === item._id.toString()) || null;

  return {
    ...item,
    promotion,
  };
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

  const discounts = await getActiveMenuItemDiscounts([item._id], timezone);
  const [itemWithDiscount] = attachMenuItemDiscounts([item], discounts);

  return itemWithDiscount;
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

  const promotionMap = new Map();

  promotions.forEach((promo) => {
    if (!promo.menuItem) return;
    promotionMap.set(promo.menuItem._id.toString(), promo);
  });

  return items.map((item) => ({
    ...item,
    promotion: promotionMap.get(item._id.toString()) || null,
  }));
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

  const menuItemIds = items.map((item) => item._id);
  const discounts = await getActiveMenuItemDiscounts(menuItemIds, timezone);

  return attachMenuItemDiscounts(items, discounts);
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

  const menuItemIds = items.map((item) => item._id);
  const discounts = await getActiveMenuItemDiscounts(menuItemIds, timezone);

  return attachMenuItemDiscounts(items, discounts);
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

  const promotionMap = new Map();

  promotions.forEach((promo) => {
    if (!promo.menuItem) return;

    promotionMap.set(promo.menuItem._id.toString(), promo);
  });

  /* -------------------------------
     ATTACH PROMOTIONS
  ------------------------------- */

  return sortedItems.map((item) => ({
    ...item,
    promotion: promotionMap.get(item._id.toString()) || null,
  }));
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

const getMenuItemsCombos = async (menuItemIds = []) => {
  if (!menuItemIds.length) return [];

  const objectIds = menuItemIds.map((id) => new mongoose.Types.ObjectId(id));

  return MenuItemsCombos.aggregate([
    {
      $match: {
        status: "active",
        menuItems: { $not: { $elemMatch: { $nin: objectIds } } },
      },
    },
    {
      $lookup: {
        from: "menuitemsubcategories",
        localField: "subCategory",
        foreignField: "_id",
        as: "subCategory",
        pipeline: [{ $project: { name: 1, status: 1, category: 1 } }],
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
        localField: "menuItems",
        foreignField: "_id",
        as: "menuItems",
        pipeline: [
          {
            $match: {
              status: "active",
              isAvailableInStock: { $ne: false },
            },
          },
          ...comboMenuItemLookupPipeline,
        ],
      },
    },
    {
      $match: {
        $expr: { $gte: [{ $size: "$menuItems" }, 2] },
      },
    },
    { $sort: { createdAt: -1 } },
  ]);
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
