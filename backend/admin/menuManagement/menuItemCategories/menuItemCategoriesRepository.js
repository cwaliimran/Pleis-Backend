// repositories/categoryRepository.js
const MenuItemCategories = require("@MenuItemCategoriesModel");
const { cache, invalidate } = require("@redisCache");
const { isPlainListCacheable } = require("@cachePolicy");
const ACTIVE_MENU_ITEM_CATEGORIES_CACHE_KEY = "menuItemCategories:active";
const buildMenuItemCategoriesCacheKey = ({
  scope = "admin", // public | admin
  skip = 0,
  limit = 10,
}) => {
  return `${ACTIVE_MENU_ITEM_CATEGORIES_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};

// Create
const createCategory = async (data) => {
  const category = new MenuItemCategories(data);
  await invalidate(ACTIVE_MENU_ITEM_CATEGORIES_CACHE_KEY);
  return await category.save();
};

// Get all with filters
const getCategoriesWithFilters = async (query, skip, limit, keyword, companyOrganizer, sortBy, sortOrder) => {
  const cacheKey = buildMenuItemCategoriesCacheKey({
    scope: "admin",
    skip,
    limit,
  });

  const fetchFn = async () => {
      const sortDirection = sortOrder === "asc" ? 1 : -1;

      let sortObj = { createdAt: -1, _id: -1 };

      if (sortBy === "title") {
        sortObj = { title: sortDirection, _id: -1 };
      } else if (sortBy === "createdAt") {
        sortObj = { createdAt: sortDirection, _id: sortDirection };
      }

      const categories = await MenuItemCategories.find(query)
        .collation({ locale: "en", strength: 2 })
        .sort(sortObj)
        .skip(skip)
        .limit(limit === 0 ? undefined : limit)
        .lean();

      return categories || [];
  };

  if (
    !isPlainListCacheable({
      keyword,
      date: query?.createdAt?.$gte,
      sortBy,
      sortOrder,
    }) || companyOrganizer
  ) {
    return fetchFn();
  }

  return cache({
    namespace: cacheKey,
    ttl: 86400,
    fetchFn,
  });
};


// Count by condition
const countCategories = async (query = {}) => {
  return MenuItemCategories.countDocuments(query);
};

// Find by ID
const findCategoryById = async (id) => {
  return MenuItemCategories.findById(id);
};

// Update and save
const updateCategoryData = async (category, data) => {
  Object.assign(category, data);
  await invalidate(ACTIVE_MENU_ITEM_CATEGORIES_CACHE_KEY);
  return await category.save();
};

// Delete
const deleteCategoryById = async (category) => {
  await invalidate(ACTIVE_MENU_ITEM_CATEGORIES_CACHE_KEY);
  return await category.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_MENU_ITEM_CATEGORIES_CACHE_KEY);
  return MenuItemCategories.findByIdAndUpdate(id, data, { new: true });
};

module.exports = {
  createCategory,
  getCategoriesWithFilters,
  countCategories,
  findCategoryById,
  updateCategoryData,
  deleteCategoryById,
  findByIdAndUpdate,
};
