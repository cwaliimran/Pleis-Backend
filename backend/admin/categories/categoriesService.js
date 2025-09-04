// services/categoryService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const categoryRepo = require("./categoriesRepository");

const createCategory = async ({ image, title, status, pinned }) => {
  return await categoryRepo.createCategory({ image, title, status, pinned });
};
const getCategories = async ({ page, limit, keyword, status, pinned, date }) => {
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
  if (pinned !== undefined) {
    query.$or = [
      ...(query.$or || []),
      { pinned: false },
      { pinned: null },
      { pinned: { $exists: false } },
    ];
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

  const pinnedQuery = { ...baseQuery, pinned: true };

  const unpinnedConditions = {
    $or: [{ pinned: false }, { pinned: null }, { pinned: { $exists: false } }],
  };
  const unpinnedQuery = {
    $and: [...(baseQuery.$and || []), unpinnedConditions],
  };

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [pinnedCategories, unpinnedCategories, totalFiltered] =
    await Promise.all([
      page === 1
        ? categoryRepo.getCategoriesWithFilters(pinnedQuery, 0, 0)
        : [],
      categoryRepo.getCategoriesWithFilters(
        unpinnedQuery,
        skip,
        limit === 0 ? 0 : limit
      ),
      categoryRepo.countCategories(baseQuery),
    ]);

  const totalPages =
    limit && totalFiltered != null ? Math.ceil(totalFiltered / limit) : 1;

  const categories = {
    pinned: pinnedCategories,
    unpinned: unpinnedCategories,
  };
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
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.pinned !== undefined && { pinned: data.pinned }),
    ...(data.image !== undefined && { image: data.image }),

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
