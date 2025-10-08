// services/categoryService.js
const { generateMeta } = require("../../../helperUtils/responseUtil");
const categoryRepo = require("./menuItemCategoriesRepository");
const createCategory = async ({ title, status }) => {
  return await categoryRepo.createCategory({ title, status });
};

const getCategories = async ({ page, limit, keyword, status, date }) => {
  const query = {};
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
  }
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }
  if (keyword) {
    query.title = { $regex: keyword, $options: "i" };
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [categories, totalFiltered, total, active, inactive] =
    await Promise.all([
      categoryRepo.getCategoriesWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit
      ),
      categoryRepo.countCategories(query),
      categoryRepo.countCategories({ status: { $ne: "deleted" } }),
      categoryRepo.countCategories({ status: "active" }),
      categoryRepo.countCategories({ status: "inactive" }),
    ]);

  let meta = generateMeta(page, limit, totalFiltered);
  meta.categoriesCount = { total, active, inactive };
  return {
    categories,
    meta,
  };
};

const getPublicCategories = async ({ page, limit, keyword, date }) => {
  const baseFilters = [{ status: "active" }];

  if (date) {
    baseFilters.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      },
    });
  }

  if (keyword) {
    baseFilters.push({
      title: { $regex: keyword, $options: "i" },
    });
  }

  const baseQuery = baseFilters.length ? { $and: baseFilters } : {};

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [categories, totalFiltered] = await Promise.all([
    categoryRepo.getCategoriesWithFilters(
      baseQuery,
      skip,
      limit === 0 ? 0 : limit
    ),
    categoryRepo.countCategories(baseQuery),
  ]);

  const totalPages =
    limit && totalFiltered != null ? Math.ceil(totalFiltered / limit) : 1;

  let meta = {
    page,
    limit,
    totalPages,
    total: totalFiltered,
  };
  return {
    categories,
    meta,
  };
};

const updateCategory = async (id, data) => {
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
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
  return true;
};

module.exports = {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getPublicCategories,
};
