// services/categoryService.js
const categoryRepo = require("./categoriesRepository");

const createCategory = async ({image, title, status, pinned }) => {
  return await categoryRepo.createCategory({ image,title, status, pinned });
};

const getCategories = async ({ page, limit, keyword, status }) => {
  const query = {};
  if (status) query.status = status;
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
    ];
  }

  // Always get pinned categories first
  const pinnedQuery = { ...query, pinned: true };
  const unpinnedQuery = { 
    ...query, 
    $or: [
      { pinned: false },
      { pinned: null },
      { pinned: { $exists: false } }
    ]
  };

  // Only skip when keyword is applied
  const skip = keyword ? (limit === 0 ? 0 : (page - 1) * limit) : 0;

  // Get pinned categories (no skip/limit), then unpinned categories (with skip/limit if no keyword)
  const [pinnedCategories, unpinnedCategories, totalFiltered, total, active, inactive, deleted] = await Promise.all([
    categoryRepo.getCategoriesWithFilters(pinnedQuery, 0, 0), // all pinned
    categoryRepo.getCategoriesWithFilters(unpinnedQuery, skip, limit === 0 ? 0 : limit), // paginated unpinned
    categoryRepo.countCategories(query),
    categoryRepo.countCategories({}),
    categoryRepo.countCategories({ status: "active" }),
    categoryRepo.countCategories({ status: "inactive" }),
    categoryRepo.countCategories({ status: "deleted" }),
  ]);

  // Combine pinned categories on top
  const categories = [...pinnedCategories, ...unpinnedCategories];

  return {
    categories,
    meta: {
      page,
      limit,
      total: totalFiltered,
      categoriesCount: { total, active, inactive, deleted },
    },
  };
};

const getPublicCategories = async ({ page, limit, keyword }) => {
  const baseQuery = { status: "active" };
  if (keyword) {
    baseQuery.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  // Always get pinned categories first
  const pinnedQuery = { ...baseQuery, pinned: true };
  const unpinnedQuery = { 
    ...baseQuery, 
    $or: [
      ...(baseQuery.$or || []),
      { pinned: false },
      { pinned: null },
      { pinned: { $exists: false } }
    ]
  };

  // Only skip when keyword is applied
  const skip = keyword ? (limit === 0 ? 0 : (page - 1) * limit) : 0;

  // Get pinned categories (no skip/limit), then unpinned categories (with skip/limit if no keyword)
  const [pinnedCategories, unpinnedCategories, totalFiltered] = await Promise.all([
    categoryRepo.getCategoriesWithFilters(pinnedQuery, 0, 0), // all pinned
    categoryRepo.getCategoriesWithFilters(unpinnedQuery, skip, limit === 0 ? 0 : limit), // paginated unpinned
    categoryRepo.countCategories(baseQuery),
  ]);

  // Combine pinned categories on top
  const categories = [...pinnedCategories, ...unpinnedCategories];

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
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.pinned !== undefined && { pinned: data.pinned }),
  };

  if (Object.keys(updateData).length === 0) {
    const category = await categoryRepo.findCategoryById(id);
    return category;
  }

  const updated = await categoryRepo.findByIdAndUpdate(id, updateData);
  return updated;
};

const deleteCategory = async (id) => {
  const updated = await categoryRepo.findByIdAndUpdate(id, { status: "deleted" });
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
