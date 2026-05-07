// services/categoryService.js
const { getPublicActiveCategories } = require("../../admin/categories/categoriesRepository");
const { formatCategories } = require("../../admin/categories/formatters/categoryFormatter");
const getPublicCategories = async (filter = {}) => {
  //only return selected fields
  let categories = await getPublicActiveCategories(filter);
  if (!categories || categories.length === 0) {
    return [];
  }
  categories = formatCategories(categories);

  return { categories };
};


module.exports = {
  getPublicCategories,
};
