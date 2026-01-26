// repositories/categoryRepository.js
const MenuItemCategories = require("@MenuItemCategoriesModel");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_MENU_ITEM_CATEGORIES_CACHE_KEY = "menuItemCategories:active";
const buildMenuItemCategoriesCacheKey = ({
  scope = "admin", // public | admin
  skip = 0,
  limit = 10
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
const getCategoriesWithFilters = async (query, skip, limit) => {
  const cacheKey = buildMenuItemCategoriesCacheKey({
    scope: "admin",
    skip,
    limit,
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day

    fetchFn: async () => {
      const categories = await MenuItemCategories.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      if (!categories) {
        return [];
      }

      return categories;
    },
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
