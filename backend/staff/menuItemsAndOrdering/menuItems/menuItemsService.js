// services/menuItemService.js
const menuItemRepo = require("./menuItemsRepository");
const { getFullImageUrl } = require("@utils/imageHelper");
const { formatMenuItem } = require("./formatter/formatMenuItems");
const MenuItemCategories = require("@MenuItemCategoriesModel");
const { findOrganizationWithSelectFilter } = require("../../../app/organizationProfile/organizationProfileRepository");
const getMenuItems = async ({ userId, timezone, organization }) => {
  // 1️⃣ Get menu ID for the organization
  const menuId = await menuItemRepo.getMenuIdByOrganization(organization);
  if (!menuId) {
    return { organizationDetails: null, menu: [] };
  }

  // 2️⃣ Fetch all active menu items for this menu
  const menuItems = await menuItemRepo.getMenuItemsWithFilters({
    menu: menuId._id,
    status: "active",
  });

  if (!menuItems.length) {
    return { organizationDetails: null, menu: [] };
  }

  // 3️⃣ Collect all category IDs used
  const categoryIds = [...new Set(menuItems.map(item => item.category.toString()))];

  // 4️⃣ Fetch category names in batch
  const categories = await MenuItemCategories
    .find({ _id: { $in: categoryIds } })
    .select("_id title image")
    .lean();

const categoryMap = categories.reduce((acc, cat) => {
  acc[cat._id.toString()] = {
    title: cat.title,
    image: cat.image ? getFullImageUrl(cat.image) : null
  };
  return acc;
}, {});


  // 5️⃣ Group by category → type → items
  const grouped = {};

  menuItems.forEach((item) => {
    const { type, category } = item;
    const categoryInfo = categoryMap[category.toString()] || { title: "Unknown", image: "no image" };
const categoryName = categoryInfo.title;


    if (!grouped[categoryName]) grouped[categoryName] = {};
    if (!grouped[categoryName][type]) grouped[categoryName][type] = [];

    grouped[categoryName][type].push(formatMenuItem(item, timezone));
  });

  // 6️⃣ Convert to final response
const menu = Object.entries(grouped).map(([categoryName, typesObj]) => ({
  category: categoryName,
  categoryImage: typesObj.__image || "no image",
  types: Object.entries(typesObj)
    .filter(([key]) => key !== "__image")
    .map(([typeName, items]) => ({
      type: typeName,
      items,
    })),
}));



  // 7️⃣ Get organization basic details
  let organizationDetails = await findOrganizationWithSelectFilter(
    organization,
    "_id basicInfo.name basicInfo.media.logo"
  );

  if (organizationDetails?.basicInfo?.media?.logo) {
    organizationDetails.basicInfo.media.logo =
      getFullImageUrl(organizationDetails.basicInfo.media.logo);
  }

  // 8️⃣ Final result (NO recommended)
  return {
    organizationDetails,
    menu,
  };
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
