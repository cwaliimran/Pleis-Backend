// services/categoryService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const categoryRepo = require("./categoriesRepository");

const createCategory = async ({ image, title, status, order }) => {
  return await categoryRepo.createCategory({ image, title, status, order });
};
const getCategories = async ({ page, limit, keyword, status, date }) => {
  const query = {};
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
  }
  // if date is available then match createdAt with date current date format is yyyy-mm-dd
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }
  if (keyword) {
    query.$or = [{ title: { $regex: keyword, $options: "i" } }];
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

  // if date is available then match createdAt with date current date format is yyyy-mm-dd
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
      $or: [
        { title: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
      ],
    });
  }

  const baseQuery = baseFilters.length ? { $and: baseFilters } : {};


  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [categories, totalFiltered] =
    await Promise.all([
      page === 1
        ? categoryRepo.getCategoriesWithFilters(baseQuery, skip,
          limit === 0 ? 0 : limit)
        : [],
      categoryRepo.countCategories(baseQuery),
    ]);

  let meta = generateMeta(page, limit, totalFiltered);

  return {
    categories,
    meta,
  };
};

const updateCategory = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.order !== undefined && { order: data.order }),

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
