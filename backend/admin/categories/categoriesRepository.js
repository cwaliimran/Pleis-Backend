// repositories/categoryRepository.js
const Categories = require("./Categories");
const { cache, invalidate } = require("@redisCache");

/**
 * ============================
 * CREATE
 * ============================
 */
const createCategory = async (data) => {
  const last = await Categories.findOne({ status: { $ne: "deleted" } })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = last ? last.order + 1 : 1;

  const category = new Categories({
    ...data,
    order: nextOrder,
  });

  const saved = await category.save();

  // invalidate only public categories cache
  await invalidate("categories:public");

  return saved;
};

/**
 * ============================
 * ADMIN — ALWAYS DB
 * ============================
 */
const getCategoriesWithFilters = async (
  filter,
  skip,
  limit,
  sort = { order: 1 },
  selectFields = null
) => {
  const query = Categories.find(filter).sort(sort);

  if (selectFields) query.select(selectFields);
  if (limit > 0) query.skip(skip).limit(limit);

  return query.exec();
};

/**
 * ============================
 * PUBLIC (CACHED)
 * Only Active Categories
 * ============================
 */
const getPublicActiveCategories = async () => {
  return cache({
    namespace: "categories:public",
    ttl: null,
    fetchFn: async () => {
      return Categories.find({ status: "active" })
        .sort({ order: 1 })
        .select("title image")
        .lean();
    },
  });
};

/**
 * ============================
 * COUNT
 * ============================
 */
const countCategories = async (query = {}) => {
  return Categories.countDocuments(query);
};

/**
 * ============================
 * FIND BY ID
 * ============================
 */
const findCategoryById = async (id) => {
  return Categories.findById(id);
};

/**
 * ============================
 * UPDATE
 * ============================
 */
const updateCategoryData = async (category, data) => {
  Object.assign(category, data);

  const updated = await category.save();

  await invalidate("categories:public");

  return updated;
};

/**
 * ============================
 * DELETE
 * ============================
 */
const deleteCategoryById = async (category) => {
  const result = await category.deleteOne();

  await invalidate("categories:public");

  return result;
};

/**
 * ============================
 * FIND + UPDATE
 * ============================
 */
const findByIdAndUpdate = async (id, data) => {
  const updated = await Categories.findByIdAndUpdate(id, data, { new: true });

  await invalidate("categories:public");

  return updated;
};

/**
 * ============================
 * BULK UPDATE
 * ============================
 */
const updateMany = async (filter, data) => {
  const result = await Categories.updateMany(filter, data);

  await invalidate("categories:public");

  return result;
};

/**
 * ============================
 * NORMALIZE ORDER
 * ============================
 */
const normalizeOrders = async () => {
  const docs = await Categories.find({ status: { $ne: "deleted" } }).sort("order");

  const ops = docs.map((doc, i) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { order: i + 1 } },
    },
  }));

  if (ops.length) await Categories.bulkWrite(ops);

  await invalidate("categories:public");

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
  getPublicActiveCategories,
};
