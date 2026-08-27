// repositories/menuItemRepository.js
const MenuItems = require("@MenuItemsModel");
const { getAllUsers } = require("../../../admin/usersManagement/usersService");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");
const { default: mongoose } = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");

// Create menuItem in a transaction and update organization

const createMenuItem = async (data) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { menuIds, ...menuItemData } = data;

    const docs = menuIds.map((menuId) => ({
      ...menuItemData,
      menu: menuId,
    }));

    const createdMenuItems = await MenuItems.insertMany(docs, {
      session,
    });

    await session.commitTransaction();

    return createdMenuItems;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Get all menuItems with their assigned organization populated, sorted by createdAt descending
const getMenuItemsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  const menuItems = await MenuItems.find(query)
    .populate({
      path: "menu",
      select: "title description",
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  if (!menuItems || menuItems.length === 0) {
    return menuItems;
  }
  return menuItems;
};
// Count by condition
const countMenuItems = async (query = {}) => {
  return MenuItems.countDocuments(query);
};

// Find by ID
const findMenuItemById = async (id) => {
  return MenuItems.findById(id)
    .populate({
      path: "daypart",
      select: "name code status startTime endTime isAllDay",
    })
    .populate({
      path: "allergens",
      select: "name code status",
    });
};

// Update and save
const updateMenuItemData = async (menuItem, data) => {
  Object.assign(menuItem, data);

  return await menuItem.save();
};

// Delete
const deleteMenuItemById = async (menuItem) => {
  return await menuItem.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return MenuItems.findByIdAndUpdate(id, data, { new: true });
};

//get menuItems for menuItem options dropdown where organization is not assigned yet

const getUnassignedMenuItems = async (userId) => {
  return await MenuItems.find({
    status: "active",
    organization: { $in: [null, undefined] },
    creator: userId,
  });
};

const findMenuItemsByMenuId = async (menuId) => {
  return MenuItems.find({
    menu: menuId,
    status: "active",
  });
};

const getMenuItemsBySubCategory = async (subCategoryId, options = {}) => {
  const { status, page = 1, limit = 10 } = options;

  const filter = { subCategory: subCategoryId };
  if (status) filter.status = status;

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    MenuItems.find(filter)
      .select("_id title status")
      // caseFirst: "lower" makes "a" sort before "A" (default Mongo/ICU puts "A" first)
      .collation({
        locale: "en",
        strength: 2,
        caseLevel: true,
        caseFirst: "lower",
      })
      .sort({ title: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MenuItems.countDocuments(filter),
  ]);
  const meta = generateMeta(page, limit, total);

  return {
    data,
    meta,
  };
};

module.exports = {
  createMenuItem,
  getMenuItemsWithFilters,
  countMenuItems,
  getUnassignedMenuItems,
  findMenuItemById,
  updateMenuItemData,
  deleteMenuItemById,
  findByIdAndUpdate,
  findMenuItemsByMenuId,
  getMenuItemsBySubCategory,
};
