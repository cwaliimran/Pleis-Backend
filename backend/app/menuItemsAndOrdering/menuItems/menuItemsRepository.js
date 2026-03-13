// repositories/menuItemRepository.js
const MenuItems = require("@MenuItemsModel");
const Menus = require("@MenusModel");
const mongoose = require("mongoose");
const MenuOrders = require("@OrdersModel");
const { getActiveMenuItemPromotions } = require("../../loyalty/promotions/promotionsRepository");

const getMenuItemsWithFilters = async ({
  query = {},
  userId = null,
  timezone = null
}) => {

  const menuItems = await MenuItems.aggregate([
    { $match: query },
    ...buildMenuItemsSaleLookup(),
    { $sort: { createdAt: -1 } }
  ]);

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

  const menuItemIds = menuItems.map(item => item._id);

  /* --------------------------------
     Fetch promotions
  -------------------------------- */

  const promotions = await getActiveMenuItemPromotions({
    menuItemIds,
    userId,
    timezone
  });

  /* --------------------------------
     Map promotions by menuItemId
  -------------------------------- */

  const promotionMap = new Map();

  promotions.forEach(promo => {
    if (!promo.menuItem) return;

    promotionMap.set(
      promo.menuItem._id.toString(),
      promo
    );
  });

  /* --------------------------------
     Attach promotion to menu items
  -------------------------------- */

  return menuItems.map(item => ({
    ...item,
    promotion: promotionMap.get(item._id.toString()) || null
  }));
};
const buildMenuItemsSaleLookup = () => {
  const now = new Date();

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
              endDateTime: { $gte: now }
            }
          },
          {
            $match: {
              $expr: {
                $in: ["$$menuItemId", "$menuItems"]
              }
            }
          },
          { $sort: { discountValue: -1 } },
          { $limit: 1 }
        ],
        as: "sale"
      }
    },
    {
      $unwind: {
        path: "$sale",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $addFields: {
        saleDiscountType: "$sale.discountType",
        saleDiscountValue: "$sale.discountValue"
      }
    }
  ];
};

const getOrganizationIdByMenuItemId = async (menuId) => {
  const menuItem = await Menus.findById(menuId).select("organization");
  if (!menuItem || !menuItem.organization) throw new Error("Menu item or menu not found");
  return menuItem.organization;
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
    ...buildMenuItemsSaleLookup()
  ]);

  const item = result[0] || null;
  if (!item) return null;

  if (!userId) return item;

  const promotions = await getActiveMenuItemPromotions({
    menuItemIds: [item._id],
    userId,
    timezone
  });

  const promotion =
    promotions.find(
      (p) => p.menuItem && p.menuItem._id.toString() === item._id.toString()
    ) || null;

  return {
    ...item,
    promotion
  };
};

const getMenuIdByOrganization = async (organizationId) => {
  return await Menus.findOne({ organization: new mongoose.Types.ObjectId(organizationId), status: "active", isOrderingEnabled: true }).select("_id").sort({ createdAt: -1 });
}

// Recommended items
// Fetch item and its category/type, then get similar items

const getRecommendedItems = async (
  menuItemId,
  userId = null,
  timezone = null,
  limit = 10
) => {
  const menuItem = await MenuItems.findById(menuItemId).lean();
  if (!menuItem) throw new Error("Menu item not found");

  const items = await MenuItems.aggregate([
    {
      $match: {
        _id: { $ne: new mongoose.Types.ObjectId(menuItemId) },
        menu: menuItem.menu,
        status: "active",
        category: menuItem.category,
        availabilityType: null,
        isAvailableInStock: true,
        type: { $regex: menuItem.type, $options: "i" }
      }
    },
    ...buildMenuItemsSaleLookup(),
    { $sort: { createdAt: -1 } },
    { $limit: limit }
  ]);

  if (!items.length || !userId) return items;

  const menuItemIds = items.map((item) => item._id);

  const promotions = await getActiveMenuItemPromotions({
    menuItemIds,
    userId,
    timezone
  });

  const promotionMap = new Map();

  promotions.forEach((promo) => {
    if (!promo.menuItem) return;
    promotionMap.set(promo.menuItem._id.toString(), promo);
  });

  return items.map((item) => ({
    ...item,
    promotion: promotionMap.get(item._id.toString()) || null
  }));
};

// ----------------------
// HYBRID RECOMMENDER (ORG-BASED)
// ----------------------
const getOrganizationHybridRecommendedItems = async (
  userId,
  timezone,
  organizationId,
  limit = 10
) => {
  // 1. Find active menu
  const menu = await Menus.findOne({
    organization: organizationId,
    status: "active",
    isOrderingEnabled: true
  }).select("_id");

  if (!menu) return [];

  // 2. Fetch active menu items
  const menuItems = await MenuItems.aggregate([
    {
      $match: {
        menu: menu._id,
        status: "active",
        availabilityType: null,
        isAvailableInStock: true
      }
    },
    ...buildMenuItemsSaleLookup()
  ]);

  if (!menuItems.length) return [];

  /* -------------------------------
     PURCHASE HISTORY
  ------------------------------- */

  const orders = await MenuOrders.find({ user: userId })
    .select("items")
    .lean();

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
    str.toLowerCase().split(/[\s,.-]+/).filter(Boolean);

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

    const purchaseScore =
      frequencyMap[item._id.toString()] || 0;

    return {
      ...item,
      _score: purchaseScore * 2 + textScore
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

  const menuItemIds = sortedItems.map(item => item._id);

  const promotions = await getActiveMenuItemPromotions({
    menuItemIds,
    userId,
    timezone
  });

  const promotionMap = new Map();

  promotions.forEach(promo => {
    if (!promo.menuItem) return;

    promotionMap.set(
      promo.menuItem._id.toString(),
      promo
    );
  });

  /* -------------------------------
     ATTACH PROMOTIONS
  ------------------------------- */

  return sortedItems.map(item => ({
    ...item,
    promotion: promotionMap.get(item._id.toString()) || null
  }));
};


module.exports = {
  getMenuItemsWithFilters,
  countMenuItems,
  findMenuItemById,
  getMenuIdByOrganization,
  getRecommendedItems,
  getOrganizationHybridRecommendedItems,
  getOrganizationIdByMenuItemId,
  buildMenuItemsSaleLookup

};
