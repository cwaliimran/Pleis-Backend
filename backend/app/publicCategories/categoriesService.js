// services/categoryService.js
const {
  getPublicActiveCategories,
  findPublicActiveCategories,
} = require("../../admin/categories/categoriesRepository");
const { formatCategories } = require("../../admin/categories/formatters/categoryFormatter");

const getPublicCategories = async (filter = {}) => {
  let categories = await getPublicActiveCategories(filter);
  if (!categories || categories.length === 0) {
    return [];
  }
  categories = formatCategories(categories);
  return { categories };
};

/** Home global bundle already Redis-caches — skip nested Azure Redis for categories. */
const getPublicCategoriesForHome = async (filter = {}) => {
  let categories = await findPublicActiveCategories(filter);
  if (!categories || categories.length === 0) {
    return [];
  }
  categories = formatCategories(categories);
  return { categories };
};

module.exports = {
  getPublicCategories,
  getPublicCategoriesForHome,
};
