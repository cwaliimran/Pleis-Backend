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
  return await Menus.findOne({ organization: organizationId, status: "active" }).select("_id isOrderingEnabled");
}

const updateMenuStock = async ({ type, menu }) => {
  //allInStock="all status active", allOutOfStock="all status inactive"
  let statusToSet = type === "allInStock" ? "active" : "inactive";
  return await MenuItems.updateMany(
    { menu: new mongoose.Types.ObjectId(menu) },
    { $set: { status: statusToSet } }
  ).lean();
}

module.exports = {
  getMenuItemsWithFilters,
  countMenuItems,
  findMenuItemById,
  getMenuIdByOrganization,
  getOrganizationIdByMenuItemId,
  updateMenuStock

};
