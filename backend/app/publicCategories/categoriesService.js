// services/categoryService.js
const { getCategoriesWithFilters } = require("../../admin/categories/categoriesRepository");
const { formatCategories } = require("../../admin/categories/formatters/categoryFormatter");

const getPublicCategories = async ({ page = 1, limit = 10 }) => {
  const query = { status: "active" };
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const sort = { order: 1 };

  //only return selected fields
  const selectFields = "title image";
  let categories = await getCategoriesWithFilters(query, skip, limit === 0 ? 0 : limit, sort, selectFields)

  categories = formatCategories(categories);

  return { categories };
};


module.exports = {
  getPublicCategories,
};
