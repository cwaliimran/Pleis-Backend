// repositories/customCategoryRepository.js
const CustomCategories = require("./CustomCategories");

// Create
// Create customCategory and automatically assign next order
const createCustomCategory = async (data) => {
  // Find the highest current order (excluding deleted)
  const last = await CustomCategories.findOne({ status: { $ne: "deleted" } })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = last ? last.order + 1 : 1;

  const customCategory = new CustomCategories({
    ...data,
    order: nextOrder,
  });

  return await customCategory.save();
};

// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const getCustomCategoriesWithFilters = async (filter, skip, limit, sort = { order: 1 }) => {
  const query = CustomCategories.find(filter).sort(sort).populate('objects');
  if (limit > 0) query.skip(skip).limit(limit);
  return query.exec();
};

// Count by condition
const countCustomCategories = async (query = {}) => {
  return CustomCategories.countDocuments(query);
};

// Find by ID
const findCustomCategoryById = async (id) => {
  return CustomCategories.findById(id).populate('objects');
};

// Update and save
const updateCustomCategoryData = async (customCategory, data) => {
  Object.assign(customCategory, data);
  return await customCategory.save();
};

// Delete
const deleteCustomCategoryById = async (customCategory) => {
  return await customCategory.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return CustomCategories.findByIdAndUpdate(id, data, { new: true }).populate('objects');
};

// Reorder helper — bulk update many
const updateMany = async (filter, data) => {
  return CustomCategories.updateMany(filter, data);
};

// Optional: Normalize all order fields sequentially (1..n)
const normalizeOrders = async () => {
  const docs = await CustomCategories.find({ status: { $ne: "deleted" } }).sort("order");
  const ops = docs.map((doc, i) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { order: i + 1 } },
    },
  }));
  if (ops.length) await CustomCategories.bulkWrite(ops);
  return true;
};

module.exports = {
  createCustomCategory,
  getCustomCategoriesWithFilters,
  countCustomCategories,
  findCustomCategoryById,
  updateCustomCategoryData,
  deleteCustomCategoryById,
  findByIdAndUpdate,
  updateMany,
  normalizeOrders,
};