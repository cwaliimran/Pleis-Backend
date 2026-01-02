// services/categoryService.js
const { getPublicActiveCategories } = require("../../admin/categories/categoriesRepository");
const { formatCategories } = require("../../admin/categories/formatters/categoryFormatter");
const getPublicCategories = async () => {
  //only return selected fields
  let categories = await getPublicActiveCategories()
  categories = formatCategories(categories);

  return { categories };
};


module.exports = {
  getPublicCategories,
};
