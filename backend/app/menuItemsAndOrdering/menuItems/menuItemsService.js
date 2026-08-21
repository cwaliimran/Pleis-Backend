// services/menuItemService.js
const menuItemRepo = require("./menuItemsRepository");
const { getFullImageUrl } = require("@utils/imageHelper");
const { formatMenuItem } = require("./formatter/formatMenuItems");
const { formatMenuItemsComboList } = require("./formatter/formatMenuItemsCombos");
const MenuItemCategories = require("@MenuItemCategoriesModel");
const MenuSubcategory = require("@MenuSubcategoryModel");
const {
  findOrganizationWithSelectFilter,
  getOrganizationMenuWithItems,
} = require("../../organizationProfile/organizationProfileRepository");
const { default: mongoose } = require("mongoose");
const { calculateItemPrice } = require("../orders/formatter/calculateItemPrice");

const getMenuItems = async ({ userId, timezone, organization }) => {
  // const result = await getOrganizationMenuWithItems({ organizationId: organization, userId, timezone });
  // console.log("result ", result);
  // 1️⃣ Get menu ID for the organization
  const menuId = await menuItemRepo.getMenuIdByOrganization(organization);
  console.log("menuId", menuId);
  if (!menuId) {
    return { recommended: [], menu: [] };
  }
  // 2️⃣ Fetch all active menu items for this menu

  const menuItems = await menuItemRepo.getMenuItemsWithFilters({
    query: {
      menu: {
        $in: menuId.map((item) => new mongoose.Types.ObjectId(item._id)),
      },
      status: "active",
      isAvailableInStock: true,
    },
    userId,
    timezone,
  });

  if (!menuItems.length) return { recommended: [], menu: [] };

  // 3️⃣ Collect all category IDs used
  const categoryIds = [...new Set(menuItems.map((item) => item.category.toString()))];

  // 4️⃣ Fetch category names in batch
  const [categories, recommended] = await Promise.all([
    MenuItemCategories.find({ _id: { $in: categoryIds } })
      .select("_id title")
      .lean(),
    menuItemRepo.getOrganizationHybridRecommendedItems(userId, timezone, organization),
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

    grouped[categoryName][type].push(applyMenuItemsSale(formatMenuItem(item, timezone)));
  });

  // 6️⃣ Convert to desired response structure
  const menu = Object.entries(grouped).map(([categoryName, typesObj]) => ({
    category: categoryName,
    types: Object.entries(typesObj).map(([typeName, items]) => ({
      type: typeName,
      items,
    })),
  }));

  let organizationDetails = await findOrganizationWithSelectFilter(
    organization,
    "_id basicInfo.name basicInfo.media.logo",
  );

  if (organizationDetails?.basicInfo?.media?.logo) {
    organizationDetails.basicInfo.media.logo = getFullImageUrl(organizationDetails.basicInfo.media.logo);
  }

  let formattedRecommended = recommended?.map((item) => applyMenuItemsSale(formatMenuItem(item, timezone))) || [];

  return { organizationDetails, recommended: formattedRecommended, menu };
};

const getSubCategoryId = (subCategory) => {
  if (subCategory == null || subCategory === "") return null;
  return subCategory.toString?.() || String(subCategory);
};

const resolveSubCategoryTitle = (subCategory, subCategoryMap = {}) => {
  const id = getSubCategoryId(subCategory);
  if (!id) return null;
  return subCategoryMap[id] || null;
};

const formatMenuItemV2 = (item, timezone, subCategoryMap) => {
  const formatted = formatMenuItem(item, timezone);
  if (!formatted) return formatted;

  const subCategoryTitle = resolveSubCategoryTitle(formatted.subCategory, subCategoryMap);

  if (subCategoryTitle) {
    formatted.subCategory = subCategoryTitle;
  } else {
    delete formatted.subCategory;
  }

  return formatted;
};

const getMenuItemsV2 = async ({ userId, timezone, organization }) => {
  // 1️⃣ Get menu ID for the organization
  let organizationDetails = await findOrganizationWithSelectFilter(
    organization,
    "_id basicInfo.name basicInfo.media.logo",
  );

  if (organizationDetails?.basicInfo?.media?.logo) {
    organizationDetails.basicInfo.media.logo = getFullImageUrl(organizationDetails.basicInfo.media.logo);
  }

  const menuId = await menuItemRepo.getMenuIdByOrganization(organization);
  if (!menuId) {
    return { organizationDetails, recommended: [], menu: [], combos: [] };
  }
  // 2️⃣ Fetch all active menu items for this menu

  const menuItems = await menuItemRepo.getMenuItemsWithFiltersV2({
    query: {
      menu: {
        $in: menuId.map((item) => new mongoose.Types.ObjectId(item._id)),
      },
    },
    timezone,
  });

  if (!menuItems.length) return { organizationDetails, recommended: [], menu: [], combos: [] };

  const recommended = await menuItemRepo.getRecommendedItemsV2(userId, timezone, menuId);

  // 3️⃣ Collect all subcategory IDs used
  const subCategoryIds = [
    ...new Set(
      [...menuItems, ...(recommended || [])].map((item) => getSubCategoryId(item.subCategory)).filter(Boolean),
    ),
  ];

  // 4️⃣ Fetch subcategory names in batch
  const subCategories = subCategoryIds.length
    ? await MenuSubcategory.find({ _id: { $in: subCategoryIds } })
        .select("_id title")
        .lean()
    : [];
  const subCategoryMap = subCategories.reduce((acc, sub) => {
    acc[sub._id.toString()] = sub.title;
    return acc;
  }, {});

  // 5️⃣ Group by subcategory (skip null / unresolved mongo ids)
  const grouped = {};

  menuItems.forEach((item) => {
    const subCategoryTitle = resolveSubCategoryTitle(item.subCategory, subCategoryMap);
    if (!subCategoryTitle) return;

    const key = getSubCategoryId(item.subCategory);
    if (!grouped[key]) {
      grouped[key] = {
        subCategory: subCategoryTitle,
        items: [],
      };
    }

    grouped[key].items.push(applyMenuItemDiscountV2(formatMenuItemV2(item, timezone, subCategoryMap)));
  });

  // 6️⃣ Convert to desired response structure
  const menu = Object.values(grouped);

  let formattedRecommended =
    recommended?.map((item) => applyMenuItemDiscountV2(formatMenuItemV2(item, timezone, subCategoryMap))) || [];

  const menuItemById = new Map(menuItems.map((item) => [item._id.toString(), item]));

  const rawCombos = await menuItemRepo.getMenuItemsCombos(menuItems.map((item) => item._id));
  console.log("rawCombos:", rawCombos);

  const combos = formatMenuItemsComboList(rawCombos, {
    timezone,
    menuItemById,
    applyDiscount: applyMenuItemDiscountV2,
  });

  return { organizationDetails, recommended: formattedRecommended, menu, combos };
};

const applyMenuItemDiscountV2 = (item) => {
  const priceInfo = calculateItemPrice(item);

  return {
    ...item,
    originalPrice: priceInfo.originalPrice,
    salePrice: priceInfo.finalPrice,
    hasDiscount: Boolean(item.discount),
    discount: item.discount || null,
  };
};

const applyMenuItemsSale = (item) => {
  const priceInfo = calculateItemPrice(item);

  return {
    ...item,
    originalPrice: priceInfo.originalPrice,
    salePrice: priceInfo.finalPrice,
    hasSale: priceInfo.saleDiscount > 0,
  };
};

const getMenuItemDetails = async (id, userId = null, timezone = null) => {
  const menuItem = await menuItemRepo.findMenuItemById(id, userId, timezone);
  if (!menuItem) return null;
  //format menu item
  const formattedMenuItem = applyMenuItemsSale(formatMenuItem(menuItem));

  return { menuItem: formattedMenuItem };
};

const getMenuItemDetailsV2 = async (id, userId = null, timezone = null) => {
  const menuItem = await menuItemRepo.findMenuItemByIdV2(id, userId, timezone);
  if (!menuItem) return null;

  const formattedMenuItem = applyMenuItemDiscountV2(formatMenuItem(menuItem, timezone));

  return { menuItem: formattedMenuItem };
};

const getHybridRecommendedItems = async ({ userId, timezone, organization }) => {
  const recommended = await menuItemRepo.getOrganizationHybridRecommendedItems(userId, timezone, organization, 10);
  let formatted = recommended.map((item) => applyMenuItemsSale(formatMenuItem(item)));
  return { recommended: formatted };
};

const getRecommendedMenuItemsV2 = async ({ userId, timezone, organization }) => {
  const menuId = await menuItemRepo.getMenuIdByOrganization(organization);
  if (!menuId) {
    return { recommended: [], menu: [] };
  }
  const recommended = await menuItemRepo.getRecommendedItemsV2(userId, timezone, menuId);
  let formatted = recommended.map((item) => formatMenuItem(item));
  return { recommended: formatted };
};

const getUpsellMenuItemsV2 = async ({ userId, timezone, organization }) => {
  const menuId = await menuItemRepo.getMenuIdByOrganization(organization);
  if (!menuId) {
    return { recommended: [], menu: [] };
  }
  const recommended = await menuItemRepo.getUpsellMenuItemsV2(userId, timezone, menuId);
  let formatted = recommended.map((item) => formatMenuItem(item));
  return { recommended: formatted };
};

module.exports = {
  getMenuItems,
  getMenuItemsV2,
  getMenuItemDetails,
  getMenuItemDetailsV2,
  getHybridRecommendedItems,
  getRecommendedMenuItemsV2,
  applyMenuItemsSale,
  applyMenuItemDiscountV2,
  getUpsellMenuItemsV2,
};
