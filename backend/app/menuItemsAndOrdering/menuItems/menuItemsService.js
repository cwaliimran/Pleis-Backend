// services/menuItemService.js
const menuItemRepo = require("./menuItemsRepository");
const { getFullImageUrl } = require("@utils/imageHelper");
const { formatMenuItem } = require("./formatter/formatMenuItems");
const MenuItemCategories = require("@MenuItemCategoriesModel");
const { findOrganizationWithSelectFilter } = require("../../organizationProfile/organizationProfileRepository");

const getMenuItems = async ({ userId, timezone, organization }) => {
  // 1️⃣ Get menu ID for the organization
  const menuId = await menuItemRepo.getMenuIdByOrganization(organization);
  if (!menuId) {
    return { recommended: [], menu: [] };
  }

  // 2️⃣ Fetch all active menu items for this menu
  const menuItems = await menuItemRepo.getMenuItemsWithFilters({
    menu: menuId._id,
    status: "active",
  });

  if (!menuItems.length) return { recommended: [], menu: [] };

  // 3️⃣ Collect all category IDs used
  const categoryIds = [...new Set(menuItems.map(item => item.category.toString()))];

  // 4️⃣ Fetch category names in batch
  const [categories, recommended] = await Promise.all([
    MenuItemCategories.find({ _id: { $in: categoryIds } }).select("_id title").lean(),
    menuItemRepo.getOrganizationHybridRecommendedItems(userId, organization)
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

  let organizationDetails = await findOrganizationWithSelectFilter(organization, "_id basicInfo.name basicInfo.media.logo");

  if (organizationDetails?.basicInfo?.media?.logo) {
    organizationDetails.basicInfo.media.logo = getFullImageUrl(organizationDetails.basicInfo.media.logo);
  }

  let formattedRecommended = recommended?.map(item => formatMenuItem(item, timezone));

  return { organizationDetails, recommended: formattedRecommended, menu };
};

const getMenuItemDetails = async (id) => {
  const [menuItem, getRecommendedItems] = await Promise.all([
    menuItemRepo.findMenuItemById(id),
    menuItemRepo.getRecommendedItems(id, 10)
  ]);
  if (!menuItem) return null;
  //format menu item and recommended items
  const formattedMenuItem = formatMenuItem(menuItem);
  const formattedRecommended = getRecommendedItems.map(item => formatMenuItem(item));

  return { menuItem: formattedMenuItem, recommended: formattedRecommended };
};

const getHybridRecommendedItems = async ({ userId, organization }) => {
  const recommended = await menuItemRepo.getOrganizationHybridRecommendedItems(
    userId,
    organization,
    10
  );
  let formatted = recommended.map(item => formatMenuItem(item));
  return { recommended: formatted };
};


module.exports = {
  getMenuItems,
  getMenuItemDetails,
  getHybridRecommendedItems
};
