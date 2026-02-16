// repositories/menuItemRepository.js
const MenuItems = require("@MenuItemsModel");
const { NotificationTypes } = require("@NotificationsModel");
const { sendUserNotifications } = require("@notificationsUtil");
const { getAllUsers } = require("../../../admin/usersManagement/usersService");

// Create menuItem in a transaction and update organization
const createMenuItem = async (data) => {
  try {
    // Create menuItem
    const userIds = (await getAllUsers({ page: 1, limit: 1000000 })).users.map(user => user._id.toString());
    const menuItem = new MenuItems(data);
    await menuItem.save();
    // await sendUserNotifications({
    //   recipientIds: userIds,
    //   title: `A new menu item "${menuItem.title}" has been created.`,
    //   body: `A new menu item "${menuItem.title}" is now available in the system.`,
    //   data: { type: NotificationTypes.MENU_ITEM_CREATED, menuItemId: menuItem._id, objectType: "menuItems" },
    //   sender: menuItem.creator,
    //   objectId: menuItem._id,
    //   image: menuItem.image || null,

    // });

    return menuItem;
  } catch (err) {
    throw err;
  }
};

// Get all menuItems with their assigned organization populated, sorted by createdAt descending
const getMenuItemsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return MenuItems.find(query)
    .populate({
      path: "menu",
      select: "title description",
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countMenuItems = async (query = {}) => {
  return MenuItems.countDocuments(query);
};

// Find by ID
const findMenuItemById = async (id) => {
  return MenuItems.findById(id);
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
    creator: userId
  });
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
};
