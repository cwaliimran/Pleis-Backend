// services/categoryService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const Categories = require("./Categories");
const categoryRepo = require("./categoriesRepository");
const { formatCategories } = require("./formatters/categoryFormatter");
const { invalidateCategoryCaches } = require("@cacheNamespaces");

const createCategory = async ({ image, title, status }) => {
  return await categoryRepo.createCategory({ image, title, status });
};
const getCategories = async ({ page, limit, keyword, status, date, sortBy = "order", sortOrder = "asc" }) => {
  const query = {};

  //Filter by status
  query.status = status ? status : "active";

  //Date filter (format: yyyy-mm-dd)
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  //Keyword search
  if (keyword) {
    query.$or = [{ title: { $regex: keyword, $options: "i" } }];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const dir = sortOrder === "desc" ? -1 : 1;
  // Stable tie-breakers so admin list order matches app order (duplicate `order` values otherwise shuffle)
  const sort = { [sortBy]: dir, ...(sortBy !== "createdAt" && { createdAt: 1 }), _id: 1 };

  let [categories, totalFiltered, total, active, inactive] = await Promise.all([
    categoryRepo.getCategoriesWithFilters(query, skip, limit === 0 ? 0 : limit, sort),
    categoryRepo.countCategories(query),
    categoryRepo.countCategories({ status: { $ne: "deleted" } }),
    categoryRepo.countCategories({ status: "active" }),
    categoryRepo.countCategories({ status: "inactive" }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.categoriesCount = { total, active, inactive };

  categories = formatCategories(categories);

  return { categories, meta };
};

const getPublicCategories = async ({ page = 1, limit = 10, keyword, date, orderSort }) => {
  const baseFilters = [{ status: "active" }];

  //Date filter
  if (date) {
    baseFilters.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      },
    });
  }

  //Keyword filter
  if (keyword) {
    baseFilters.push({ title: { $regex: keyword, $options: "i" } });
  }

  const query = baseFilters.length ? { $and: baseFilters } : {};
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const sort = { order: orderSort === "desc" ? -1 : 1 };

  //only return selected fields
  const selectFields = "title image";

  let [categories, totalFiltered] = await Promise.all([
    categoryRepo.getCategoriesWithFilters(query, skip, limit === 0 ? 0 : limit, sort, selectFields),
    categoryRepo.countCategories(query),
  ]);

  categories = formatCategories(categories);

  const meta = generateMeta(page, limit, totalFiltered);

  return { categories, meta };
};


const updateCategory = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.status !== undefined && { status: data.status }),
  };

  if (Object.keys(updateData).length === 0) {
    const category = await categoryRepo.findCategoryById(id);
    return category;
  }

  const updated = await categoryRepo.findByIdAndUpdate(id, updateData);
  return updated;
};

const deleteCategory = async (id) => {
  const updated = await categoryRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  await categoryRepo.normalizeOrders();

  return true;
};


/**
 * Reorder by POSITION (1-based), as sent by the admin drag & drop list.
 * Positions refer to the list the admin sees (active categories when the moved item is active).
 * Rebuilds a contiguous 1..n order for every non-deleted category, which also self-heals
 * duplicate / gapped `order` values instead of shifting ranges on stale numbers.
 */
const reorderCategory = async (movedId, previousOrder, newOrder) => {
  const all = await Categories.find({ status: { $ne: "deleted" } })
    .sort({ order: 1, createdAt: 1, _id: 1 })
    .select("_id status")
    .lean();

  const moved = all.find((c) => String(c._id) === String(movedId));
  if (!moved) return null;

  // Work on the subset the admin sees, then put it back into the same slots.
  const inSubset = (c) => (moved.status === "active" ? c.status === "active" : true);
  const subset = all.filter(inSubset);

  const fromIdx = subset.findIndex((c) => String(c._id) === String(movedId));
  const target = Math.min(Math.max(parseInt(newOrder, 10) || 1, 1), subset.length) - 1;
  subset.splice(fromIdx, 1);
  subset.splice(target, 0, moved);

  let k = 0;
  const finalList = all.map((c) => (inSubset(c) ? subset[k++] : c));

  const ops = finalList.map((c, i) => ({
    updateOne: { filter: { _id: c._id }, update: { $set: { order: i + 1 } } },
  }));
  if (ops.length) await Categories.bulkWrite(ops);

  await invalidateCategoryCaches();
  return true;
};

module.exports = {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getPublicCategories,
  reorderCategory,
};
