const { generateMeta } = require("@utils/responseUtil");
const categoryRepo = require("./globalRewardCategoriesRepository");
const { formatGlobalCategory } = require("./formatter/formatItemCategories");

const getCategories = async ({ page, limit }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [categories, total] = await Promise.all([
    categoryRepo.getCategoriesWithActiveRewards(skip, limit),
    categoryRepo.countCategoriesWithActiveRewards(),
  ]);

  const meta = generateMeta(page, limit, total);

  const formattedCategories =
    categories?.map(cat => formatGlobalCategory(cat));

  return {
    categories: formattedCategories,
    meta,
  };
};

module.exports = {
  getCategories,
};
