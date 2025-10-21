// repositories/categoryRepository.js
const Categories = require("./Categories");

// Create
// Create category and automatically assign next order
const createCategory = async (data) => {
  // Find the highest current order (excluding deleted)
  const last = await Categories.findOne({ status: { $ne: "deleted" } })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = last ? last.order + 1 : 1;

  const category = new Categories({
    ...data,
    order: nextOrder,
  });

  return await category.save();
};

// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const getCategoriesWithFilters = async (
  filter,
  skip,
  limit,
  sort = { order: 1 },
  selectFields = null
) => {
  const query = Categories.find(filter).sort(sort);

  if (selectFields) query.select(selectFields); // apply select dynamically
  if (limit > 0) query.skip(skip).limit(limit);

  return query.exec();
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

// Reorder helper — bulk update many
const updateMany = async (filter, data) => {
  return Categories.updateMany(filter, data);
};

// Optional: Normalize all order fields sequentially (1..n)
const normalizeOrders = async () => {
  const docs = await Categories.find({ status: { $ne: "deleted" } }).sort("order");
  const ops = docs.map((doc, i) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { order: i + 1 } },
    },
  }));
  if (ops.length) await Categories.bulkWrite(ops);
  return true;
};

module.exports = {
  createCategory,
  getCategoriesWithFilters,
  countCategories,
  findCategoryById,
  updateCategoryData,
  deleteCategoryById,
  findByIdAndUpdate,
  updateMany,
  normalizeOrders,
};
