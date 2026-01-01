// services/menuItemService.js
const menuItemRepo = require("./menuItemsRepository");
const { formatMenuItem } = require("./formatter/formatMenuItems");
const MenuItemCategories = require("@MenuItemCategoriesModel");

const getMenuItems = async ({ status, timezone, organization }) => {
  // 1️⃣ Get menu ID for the organization
  const menuId = await menuItemRepo.getMenuIdByOrganization(organization);
  if (!menuId) {
    return { menu: [] };
  }

  // 2️⃣ Fetch all active menu items for this menu
  const menuItems = await menuItemRepo.getMenuItemsWithFilters({
    menu: menuId._id,
    status,
  });

  if (!menuItems.length) return { menu: [] };

  // 3️⃣ Collect all category IDs used
  const categoryIds = [...new Set(menuItems.map(item => item.category.toString()))];

  // 4️⃣ Fetch category names in batch
  const [categories] = await Promise.all([
    MenuItemCategories.find({ _id: { $in: categoryIds } }).select("_id title").lean(),
  ]);
  const categoryMap = categories.reduce((acc, cat) => {
    acc[cat._id.toString()] = cat.title;
    return acc;
  }, {});

  // 5️⃣ Group by category → type → items
  const grouped = {};

  menuItems.forEach((item) => {
    const { type, category } = item;
    const categoryName = categoryMap[category.toString()] || category.toString();

    if (!grouped[categoryName]) grouped[categoryName] = {};
    if (!grouped[categoryName][type]) grouped[categoryName][type] = [];

    grouped[categoryName][type].push(formatMenuItem(item, timezone));
  });

  // 6️⃣ Convert to desired response structure
  const menu = Object.entries(grouped).map(([categoryName, typesObj]) => ({
    category: categoryName,
    types: Object.entries(typesObj).map(([typeName, items]) => ({
      type: typeName,
      items,
    })),
  }));

  return { menu };
};

const getMenuItemDetails = async (id) => {
  const [menuItem] = await Promise.all([
    menuItemRepo.findMenuItemById(id),
  ]);
  if (!menuItem) return null;
  //format menu item and recommended items
  const formattedMenuItem = formatMenuItem(menuItem);

  return { menuItem: formattedMenuItem };
};


module.exports = {
  getMenuItems,
  getMenuItemDetails,
};
