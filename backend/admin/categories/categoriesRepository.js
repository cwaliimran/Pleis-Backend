// repositories/categoryRepository.js
const Categories = require("./Categories");

// Create
const createCategory = async (data) => {
  const category = new Categories(data);
  return await category.save();
};

// Get all with filters
const getCategoriesWithFilters = async (query, skip, limit) => {
  return Categories.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countCategories = async (query = {}) => {
  return Categories.countDocuments(query);
};

// Find by ID
const findCategoryById = async (id) => {
  return Categories.findById(id);
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
  return Categories.findByIdAndUpdate(id, data, { new: true });
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
