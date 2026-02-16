// services/categoryService.js
const { generateMeta } = require("@utils/responseUtil");
const categoryRepo = require("./menuItemCategoriesRepository");
const { formatItemCategory } = require("../menuItems/formatter/formatMenuItems");
const createCategory = async ({ image, title, status,companyOrganizer }) => {
  let category = await categoryRepo.createCategory({ image, title, status,companyOrganizer });
  return formatItemCategory(category);
};

const getCategories = async ({ page, limit, keyword, companyOrganizer, status, date }) => {
  const query = {};

  // Handle 'status' filter
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
  }

  // Handle 'date' filter
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  // Handle 'keyword' filter
  if (keyword) {
    query.title = { $regex: keyword, $options: "i" };
  }

  // Handle 'companyOrganizer' filter - matching provided value or null
  if (companyOrganizer) {
    query.$or = [
      { companyOrganizer },
      { companyOrganizer: null } 
    ];
  }
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Fetch categories with various counts
  const [categories, totalFiltered, total, active, inactive] =
    await Promise.all([
      categoryRepo.getCategoriesWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit,
        keyword,
        companyOrganizer
      ),
      categoryRepo.countCategories(query),
      categoryRepo.countCategories({ status: { $ne: "deleted" } }),
      categoryRepo.countCategories({ status: "active" }),
      categoryRepo.countCategories({ status: "inactive" }),
    ]);

  let meta = generateMeta(page, limit, totalFiltered);
  meta.categoriesCount = { total, active, inactive };

  // Format categories if needed
  let formattedCategories = categories?.map((cat) => formatItemCategory(cat));

  return {
    categories: formattedCategories,
    meta,
  };
};


const getPublicCategories = async ({ page, limit, keyword, date }) => {
  const baseFilters = [{ status: "active" }]
  console.log("enter", );

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
  let formattedCategories = categories?.map((cat) => formatItemCategory(cat));
  console.log("formattedCategories",formattedCategories );
  return {
    categories: formattedCategories,
    meta,
  };
};

const updateCategory = async (id, data) => {
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.image !== undefined && { image: data.image }),
  };

  if (Object.keys(updateData).length === 0) {
    const category = await categoryRepo.findCategoryById(id);
    return category;
  }

  let updated = await categoryRepo.findByIdAndUpdate(id, updateData);
  if (!updated) return null;
  let updatedCategory = await categoryRepo.findCategoryById(id);
  updated = formatItemCategory(updatedCategory);
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
