// repositories/menuItemRepository.js
const MenuItems = require("@MenuItemsModel");
const Menus = require("@MenusModel");
const mongoose = require("mongoose");
const MenuOrders = require("@OrdersModel");

const getMenuItemsWithFilters = async (query = {}) => {
  return MenuItems.find(query)
    .sort({ createdAt: -1 })
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
const findMenuItemById = async (id) => {
  return MenuItems.findById(id);
};

const getMenuIdByOrganization = async (organizationId) => {
  return await Menus.findOne({ organization: organizationId, status: "active" }).select("_id");
}

// Recommended items
// Fetch item and its category/type, then get similar items

const getRecommendedItems = async (menuItemId, limit = 10) => {
  // Find the original item
  const menuItem = await MenuItems.findById(menuItemId).lean();
  if (!menuItem) throw new Error("Menu item not found");

  // Build query to find similar items
  const query = {
    _id: { $ne: new mongoose.Types.ObjectId(menuItemId) }, // exclude the current item
    menu: menuItem.menu,
    status: "active",
    category: menuItem.category,
    // Use case-insensitive partial match for type
    type: { $regex: menuItem.type, $options: "i" },
  };

  // Fetch recommended items (sorted by latest)
  const recommended = await MenuItems.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);

  return recommended;
};

// ----------------------
// HYBRID RECOMMENDER (ORG-BASED)
// ----------------------
const getOrganizationHybridRecommendedItems = async (userId, organizationId, limit = 10) => {
  // 1. Find active menu
  const menu = await Menus.findOne({
    organization: organizationId,
    status: "active"
  }).select("_id");

  if (!menu) return [];

  // 2. Fetch all active menu items for this organization
  const menuItems = await MenuItems.find({
    menu: menu._id,
    status: "active"
  }).lean();

  if (!menuItems.length) return [];


  // -------------------------------
  // 3. PURCHASE HISTORY FREQUENCY
  // -------------------------------
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

  // -------------------------------
  // 4. TEXT TOKENIZER
  // -------------------------------
  const tokenize = (str) =>
    str.toLowerCase().split(/[\s,.-]+/).filter(Boolean);

  // -------------------------------
  // 5. BUILD SCORES FOR EACH ITEM
  // -------------------------------
  const results = menuItems.map((item) => {

    const words = tokenize(item.title);

    // TEXT SCORE: match between items inside the same menu
    let textScore = 0;
    menuItems.forEach((other) => {
      if (other._id.toString() === item._id.toString()) return;
      tokenize(other.title).forEach(w => {
        if (words.includes(w)) textScore++;
      });
    });

    const purchaseScore = frequencyMap[item._id.toString()] || 0;

    return {
      ...item,
      _score: (purchaseScore * 2) + textScore
    };
  });

  return results
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
};

module.exports = {
  getMenuItemsWithFilters,
  countMenuItems,
  findMenuItemById,
  getMenuIdByOrganization,
  getRecommendedItems,
  getOrganizationHybridRecommendedItems,
  getOrganizationIdByMenuItemId

};
