// repositories/menuRepository.js
const Menus = require("@MenusModel");
const mongoose = require("mongoose");

// Create menu in a transaction and update organization
const createMenu = async (data) => {
  try {
    // Create menu
    const menu = new Menus(data);
    await menu.save();
    return menu;
  } catch (err) {
    throw err;
  }
};

// Get all menus with their assigned organization populated, sorted by createdAt descending
const getMenusWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Menus.find(query)
    .populate({
      path: "organization",
      select: "basicInfo.name"
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countMenus = async (query = {}) => {
  return Menus.countDocuments(query);
};

// Find by ID
const findMenuById = async (id) => {
  return Menus.findById(id);
};

// Update and save
const updateMenuData = async (menu, data) => {
  Object.assign(menu, data);
  return await menu.save();
};

// Delete
const deleteMenuById = async (menu) => {
  return await menu.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return Menus.findByIdAndUpdate(id, data, { new: true });
};

//get menus for menu options dropdown where organization is not assigned yet

const getUnassignedMenus = async (userId) => {
  return await Menus.find({
    status: "active",
    organization: { $in: [null, undefined] },
    creator: userId
  });
};


const createDuplicatedMenu = async (menuData, session = null) => {
  const duplicatedMenu = new Menus(menuData);
  return await duplicatedMenu.save({ session });
};

const getMenuItemsByMenuId = async (menuId, session = null) => {
  return await Menus.find({ menu: menuId }).session(session);
};

const createDuplicatedMenuItem = async (itemData, session = null) => {
  const duplicatedItem = new Menus(itemData);
  return await duplicatedItem.save({ session });
};


module.exports = {
  createMenu,
  getMenusWithFilters,
  countMenus,
  createDuplicatedMenu,
  getMenuItemsByMenuId,
  createDuplicatedMenuItem,
  getUnassignedMenus,
  findMenuById,
  updateMenuData,
  deleteMenuById,
  findByIdAndUpdate,
};
