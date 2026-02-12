// repositories/categoryRepository.js
const GlobalRewardCategories = require("@GlobalRewardCategories");
const { getModelCounts } = require("@utils/dbUtils/queryUtil");

// Create
const createCategory = async (data) => {
  const category = new GlobalRewardCategories(data);
  return await category.save();
};

// Get all with filters
const getCategoriesWithFilters = async (query, skip, limit) => {
  return GlobalRewardCategories.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countCategories = async (query = {}) => {
  return GlobalRewardCategories.countDocuments(query);
};


const getCounts = async (query = {}) => {
  return await getModelCounts({
    model: GlobalRewardCategories,
    filterQuery: query,
    statusMap: {
      status: ["active", "inactive"],
    },
  });
};


// Find by ID
const findCategoryById = async (id) => {
  return GlobalRewardCategories.findById(id);
};

// Update and save
const updateCategoryData = async (category, data) => {
  Object.assign(category, data);
  return await category.save();
};

// Delete
const deleteCategoryById = async (category) => {
  return await category.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return GlobalRewardCategories.findByIdAndUpdate(id, data, { new: true });
};
const getCategoriesWithFiltersTitleonly = async (query, skip, limit) => {
  return GlobalRewardCategories.find(query)
    .select({ _id: 1, title: 1 }) 
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean(); // optional but recommended
};


module.exports = {
  createCategory,
  getCategoriesWithFilters,
  countCategories,
  findCategoryById,
  updateCategoryData,
  deleteCategoryById,
  findByIdAndUpdate,
  getCounts,
  getCategoriesWithFiltersTitleonly
};
