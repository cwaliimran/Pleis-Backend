// services/menuItemService.js
const menuItemRepo = require("./menuItemsRepository");
const appMenuItemRepo = require("../../../app/menuItemsAndOrdering/menuItems/menuItemsRepository");
const { formatMenuItem } = require("./formatter/formatMenuItems");
const {
  formatMenuItemsComboList,
} = require("../../../app/menuItemsAndOrdering/menuItems/formatter/formatMenuItemsCombos");
const {
  applyMenuItemDiscountV2,
  applyMenuItemsSale,
} = require("../../../app/menuItemsAndOrdering/menuItems/menuItemsService");
const MenuSubcategory = require("@MenuSubcategoryModel");
const mongoose = require("mongoose");
const {
  getOrgCompanyOrganizer,
} = require("../../../app/organizationProfile/organizationProfileRepository");

const getSubCategoryId = (subCategory) => {
  if (!subCategory) return null;
  if (typeof subCategory === "object") {
    return subCategory._id ? subCategory._id.toString() : null;
  }
  return subCategory.toString();
};

const resolveSubCategoryTitle = (subCategory, subCategoryMap = {}) => {
  const id = getSubCategoryId(subCategory);
  if (!id) return null;
  return subCategoryMap[id] || null;
};

const formatMenuItemV2 = (item, timezone, subCategoryMap) => {
  const formatted = formatMenuItem(item, timezone);
  if (!formatted) return formatted;

  const subCategoryTitle = resolveSubCategoryTitle(
    formatted.subCategory,
    subCategoryMap,
  );

  if (subCategoryTitle) {
    formatted.subCategory = subCategoryTitle;
  } else {
    delete formatted.subCategory;
  }

  return formatted;
};

const getMenuItems = async ({ timezone, organization }) => {
  const menuId = await menuItemRepo.getMenuIdByOrganization(organization);
  if (!menuId) return { menu: [] };

  const menuItems = await menuItemRepo.getMenuItemsWithFilters({
    menu: menuId._id,
    status: "active",
  });
  if (!menuItems.length) return { menu: [] };

  const categoryIds = [
    ...new Set(menuItems.map((i) => i.subCategory.toString())),
  ];
  const categories = await MenuSubcategory.find({ _id: { $in: categoryIds } })
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

/** Staff v2: same menu/combo shape as app v2, without org/recommended/upsell. */
const getMenuItemsV2 = async ({ timezone, organization }) => {
  const menus = await appMenuItemRepo.getMenuIdByOrganization(organization);
  if (!menus?.length) return { menu: [], combos: [] };

  const menuItems = await appMenuItemRepo.getMenuItemsWithFiltersV2({
    query: {
      menu: {
        $in: menus.map((item) => new mongoose.Types.ObjectId(item._id)),
      },
    },
    timezone,
  });

  if (!menuItems.length) return { menu: [], combos: [] };

  const subCategoryIds = [
    ...new Set(
      menuItems.map((item) => getSubCategoryId(item.subCategory)).filter(Boolean),
    ),
  ];

  const subCategories = subCategoryIds.length
    ? await MenuSubcategory.find({
        _id: { $in: subCategoryIds },
        status: "active",
      })
        .select("_id title order")
        .sort({ order: 1 })
        .lean()
    : [];

  const subCategoryMap = subCategories.reduce((acc, sub) => {
    acc[sub._id.toString()] = sub.title;
    return acc;
  }, {});

  const grouped = {};
  menuItems.forEach((item) => {
    const subCategoryTitle = resolveSubCategoryTitle(
      item.subCategory,
      subCategoryMap,
    );
    if (!subCategoryTitle) return;

    const key = getSubCategoryId(item.subCategory);
    if (!grouped[key]) {
      grouped[key] = {
        subCategory: subCategoryTitle,
        items: [],
      };
    }

    grouped[key].items.push(
      applyMenuItemDiscountV2(
        formatMenuItemV2(item, timezone, subCategoryMap),
      ),
    );
  });

  const menu = subCategories
    .map((sub) => grouped[sub._id.toString()])
    .filter(Boolean);
  const menuItemById = new Map(
    menuItems.map((item) => [item._id.toString(), item]),
  );

  const companyOrganizer = await getOrgCompanyOrganizer(organization);
  const rawCombos = await appMenuItemRepo.getMenuItemsCombos(
    menuItems,
    companyOrganizer,
    timezone,
  );

  const combos = formatMenuItemsComboList(rawCombos, {
    timezone,
    menuItemById,
    applyDiscount: applyMenuItemDiscountV2,
  });

  return { menu, combos };
};

const getMenuItemsToManage = async ({ timezone, organization }) => {
  const menu = await menuItemRepo.getMenuIdByOrganization(organization);
  if (!menu) return { menu: [] };

  const menuItems = await menuItemRepo.getMenuItemsWithFilters({
    menu: menu._id,
    status: { $in: ["active", "inactive"] },
  });

  if (!menuItems.length) return { menu: [] };

  const categoryIds = [
    ...new Set(
      menuItems
        .map((i) => i.subCategory || i.category)
        .filter(Boolean)
        .map((id) => id.toString()),
    ),
  ];

  const categories = await MenuSubcategory.find({
    _id: { $in: categoryIds },
  })
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
      totalInStock: menuItems.filter((i) => i.status === "active").length,
      totalOutOfStock: menuItems.filter((i) => i.status !== "active").length,
    },
  };
};

function formatMenuGrouping(menuItems, timezone, categoryMap = {}) {
  const grouped = {};

  menuItems.forEach((item) => {
    const { type, subCategory } = item;
    const categoryKey = (subCategory || item.category || "").toString();
    if (!categoryKey) return;

    const categoryName = categoryMap[categoryKey] || categoryKey;

    if (!grouped[categoryName]) grouped[categoryName] = {};
    if (!grouped[categoryName][type]) grouped[categoryName][type] = [];

    grouped[categoryName][type].push(
      applyMenuItemsSale(formatMenuItem(item, timezone)),
    );
  });

  return Object.entries(grouped).map(([categoryName, typesObj]) => ({
    category: categoryName,
    types: Object.entries(typesObj).map(([typeName, items]) => ({
      type: typeName,
      items,
    })),
  }));
}

const getMenuItemDetails = async (id, timezone) => {
  const menuItem = await menuItemRepo.findMenuItemById(id);
  if (!menuItem) return null;
  const formattedMenuItem = applyMenuItemsSale(
    formatMenuItem(menuItem, timezone),
  );

  return { menuItem: formattedMenuItem };
};

const updateMenuStockService = async ({ type, menu }) => {
  return menuItemRepo.updateMenuStock({ type, menu });
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
    "taxPercent",
    "menu",
    "startTime",
    "endTime",
    "status",
  ];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return menuItem;
  }

  Object.assign(menuItem, updateData);
  await menuItem.save();

  return formatMenuItem(menuItem, timezone);
};

module.exports = {
  getMenuItems,
  getMenuItemsV2,
  getMenuItemDetails,
  getMenuItemsToManage,
  updateMenuStockService,
  updateMenuItem,
};
