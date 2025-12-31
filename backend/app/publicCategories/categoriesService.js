// services/categoryService.js
const { getPublicActiveCategories } = require("../../admin/categories/categoriesRepository");
const { formatCategories } = require("../../admin/categories/formatters/categoryFormatter");
const getPublicCategories = async ({ page = 1, limit = 10 }) => {
  const query = { status: "active" };
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const sort = { order: 1 };

  //only return selected fields
  let categories = await getPublicActiveCategories()

  categories = formatCategories(categories);

  return { categories };
};


module.exports = {
  getPublicCategories,
};
