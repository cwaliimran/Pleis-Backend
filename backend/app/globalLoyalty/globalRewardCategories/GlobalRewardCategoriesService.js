// services/categoryService.js
const { generateMeta } = require("@utils/responseUtil");
const categoryRepo = require("./globalRewardCategoriesRepository");
const { formatGlobalCategory } = require("./formatter/formatItemCategories");

const getCategories = async ({ page, limit }) => {

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [categories, counts] =
    await Promise.all([
      categoryRepo.getCategoriesWithFilters(skip, limit === 0 ? 0 : limit),
      categoryRepo.getCounts(),
    ]);

  // Generate pagination metadata
  let meta = generateMeta(page, limit, counts.totalFiltered);

  // Format categories
  let formattedCategories = categories?.map((cat) => formatGlobalCategory(cat));
console.log("meta",meta)
  return {
    categories: formattedCategories,
    meta,
  };
};



module.exports = {
  getCategories,
};
