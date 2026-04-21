// repositories/menuItemRepository.js
const MenuItems = require("@MenuItemsModel");
const { getAllUsers } = require("../../../admin/usersManagement/usersService");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");


// Create menuItem in a transaction and update organization
const createMenuItem = async (data) => {
  try {
    // Create menuItem
    console.log("data",data );
    const menuItem = new MenuItems(data);
    await menuItem.save();
    // const userIds = (await getAllUsers({ page: 1, limit: 1000000 })).users.map(user => user._id.toString());
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

const findMenuItemsByMenuId = async (menuId) => {
  return MenuItems.find({
    menu: menuId,
    status: "active"
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
  findMenuItemsByMenuId
};
