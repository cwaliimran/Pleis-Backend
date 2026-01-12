// services/menuItemService.js
const menuItemRepo = require("./menuItemsRepository");
const { formatMenuItem } = require("./formatter/formatMenuItems");
const MenuItemCategories = require("@MenuItemCategoriesModel");

const getMenuItems = async ({ timezone, organization }) => {
  const menuId = await menuItemRepo.getMenuIdByOrganization(organization);
  if (!menuId) return { menu: [] };

  const menuItems = await menuItemRepo.getMenuItemsWithFilters({
    menu: menuId._id,
    status: "active",
  });

  if (!menuItems.length) return { menu: [] };

  const categoryIds = [
    ...new Set(menuItems.map(i => i.category.toString()))
  ];

  const categories = await MenuItemCategories
    .find({ _id: { $in: categoryIds } })
    .select("_id title")
    .lean();

  const categoryMap = categories.reduce((acc, cat) => {
    acc[cat._id.toString()] = cat.title;
    return acc;
  }, {});

  return {
    menu: formatMenuGrouping(menuItems, timezone, categoryMap),
  };
};


const getMenuItemsToManage = async ({ timezone, organization }) => {
  const menu = await menuItemRepo.getMenuIdByOrganization(organization);
  if (!menu) return { menu: [] };

  const menuItems = await menuItemRepo.getMenuItemsWithFilters({
    menu: menu._id,
    status: { $in: ["active", "inactive"] }
  });

  if (!menuItems.length) return { menu: [] };

  const categoryIds = [
    ...new Set(menuItems.map(i => i.category.toString()))
  ];

  const categories = await MenuItemCategories
    .find({ _id: { $in: categoryIds } })
    .select("_id title")
    .lean();

  const categoryMap = categories.reduce((acc, cat) => {
    acc[cat._id.toString()] = cat.title;
    return acc;
  }, {});

  return {
    menu: formatMenuGrouping(menuItems, timezone, categoryMap),
    meta: {
      menu: menu._id,
      isOrderingEnabled: menu.isOrderingEnabled || true,
      totalItems: menuItems.length,
      totalInStock: menuItems.filter(i => i.status === "active").length,
      totalOutOfStock: menuItems.filter(i => i.status !== "active").length,
    },
  };
};


function formatMenuGrouping(menuItems, timezone, categoryMap = {}) {
  const grouped = {};

  menuItems.forEach((item) => {
    const { type, category } = item;

    const categoryName =
      categoryMap[category.toString()] || category.toString();

    if (!grouped[categoryName]) grouped[categoryName] = {};
    if (!grouped[categoryName][type]) grouped[categoryName][type] = [];

    grouped[categoryName][type].push(formatMenuItem(item, timezone));
  });

  return Object.entries(grouped).map(([categoryName, typesObj]) => ({
    category: categoryName,
    types: Object.entries(typesObj).map(([typeName, items]) => ({
      type: typeName,
      items,
    })),
  }));
}


const getMenuItemDetails = async (id) => {
  const [menuItem] = await Promise.all([
    menuItemRepo.findMenuItemById(id),
  ]);
  if (!menuItem) return null;
  //format menu item and recommended items
  const formattedMenuItem = formatMenuItem(menuItem);

  return { menuItem: formattedMenuItem };
};

const updateMenuStockService = async ({ type, menu, timezone }) => {
  // Update stock based on type
  let data = await menuItemRepo.updateMenuStock({ type, menu });

  // const menuItems = await menuItemRepo.getMenuItemsWithFilters({
  //   menu,
  // });

  // if (!menuItems.length) return { menu: [] };

  // const categoryIds = [
  //   ...new Set(menuItems.map(i => i.category.toString()))
  // ];

  // const categories = await MenuItemCategories
  //   .find({ _id: { $in: categoryIds } })
  //   .select("_id title")
  //   .lean();

  // const categoryMap = categories.reduce((acc, cat) => {
  //   acc[cat._id.toString()] = cat.title;
  //   return acc;
  // }, {});

  // return {
  //   menu: formatMenuGrouping(menuItems, timezone, categoryMap),
  //   menuId: menu,
  // };
  return data;
};


const updateMenuItem = async (id, data, timezone) => {
  const menuItem = await menuItemRepo.findMenuItemById(id);
  if (!menuItem) return null;

  const allowedFields = [
    "image",
    "title",
    "description",
    "type",
    "category",
    "basePrice",
    "discountPrice",
    "taxPercent",
    "menu",
    "startTime",
    "endTime",
    "status"
  ];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return menuItem; // nothing to update
  }

  Object.assign(menuItem, updateData);
  await menuItem.save();

  // Return updated menuItem
  let obj = formatMenuItem(menuItem, timezone);

  return obj;
};

module.exports = {
  getMenuItems,
  getMenuItemDetails,
  getMenuItemsToManage,
  updateMenuStockService,
  updateMenuItem
};
