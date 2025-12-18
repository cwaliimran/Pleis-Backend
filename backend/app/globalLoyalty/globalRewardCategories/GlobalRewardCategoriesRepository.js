const GlobalRewardCategories = require("@GlobalRewardCategories");
const { getModelCounts } = require("../../../helperUtils/dbUtils/queryUtil");


// Get all with filters
const getCategoriesWithFilters = async (skip, limit) => {
  return GlobalRewardCategories.find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

const getCounts = async () => {
  let counts = getModelCounts({
    model: GlobalRewardCategories,
    statusMap: {
      status: ["active"]
    }
  });
  return counts;
};


module.exports = {
  getCategoriesWithFilters,
  getCounts,
};
