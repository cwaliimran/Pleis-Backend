// repositories/menuItemRepository.js
const MenuItems = require("@MenuItemsModel");
const Menus = require("@MenusModel");
const mongoose = require("mongoose");

const getMenuItemsWithFilters = async (query = {}) => {
  return MenuItems.find(query)
    .sort({ createdAt: -1 })
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


module.exports = {
  getMenuItemsWithFilters,
  countMenuItems,
  findMenuItemById,
  getMenuIdByOrganization,
  getRecommendedItems,

};
