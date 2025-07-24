// services/categoryService.js
const categoryRepo = require("./categoriesRepository");

const createCategory = async ({ title, description, status }) => {
  return await categoryRepo.createCategory({ title, description, status });
};

const getCategories = async ({ page, limit, keyword, status }) => {
  const query = {};
  if (status) query.status = status;
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [categories, totalFiltered, total, active, inactive] = await Promise.all([
    categoryRepo.getCategoriesWithFilters(query, skip, limit === 0 ? 0 : limit),
    categoryRepo.countCategories(query),
    categoryRepo.countCategories({}),
    categoryRepo.countCategories({ status: "active" }),
    categoryRepo.countCategories({ status: "inactive" }),
  ]);

  return {
    categories,
    meta: {
      page,
      limit,
      total: totalFiltered,
      categoriesCount: { total, active, inactive },
    },
  };
};

const getPublicCategories = async ({ page, limit, keyword }) => {
  const query = { status: "active" };
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [categories, totalFiltered] = await Promise.all([
    categoryRepo.getCategoriesWithFilters(query, skip, limit === 0 ? 0 : limit),
    categoryRepo.countCategories(query),
  ]);

  return {
    categories,
    meta: {
      page,
      limit,
      total: totalFiltered,
    },
  };
};

const updateCategory = async (id, data) => {
  const category = await categoryRepo.findCategoryById(id);
  if (!category) return null;

  const updated = await categoryRepo.updateCategoryData(category, data);
  return updated;
};

const deleteCategory = async (id) => {
  const category = await categoryRepo.findCategoryById(id);
  if (!category) return null;

  await categoryRepo.deleteCategoryById(category);
  return true;
};

module.exports = {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getPublicCategories,
};
