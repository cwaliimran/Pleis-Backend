// services/categoryService.js
const { generateMeta } = require("@utils/responseUtil");
const categoryRepo = require("./globalRewardCategoriesRepository");
const { formatGlobalRewardCategory } = require("./formatter/formatItemCategories");
const mongoose = require("mongoose");
const createCategory = async ({ image, title, status,createID }) => {
  let category = await categoryRepo.createCategory({ image, title, status, createID });
  return formatGlobalRewardCategory(category);
};

const getCategories = async ({ page, limit, keyword, status, date, createID }) => {
  const query = {};

  // Filter by status
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" }; // Exclude deleted categories
  }

  // Filter by creation date
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  // Filter by keyword in title
  if (keyword) {
    query.title = { $regex: keyword, $options: "i" };
  }

  // Filter by createID (user who created the category)
  if (createID) {
    query.createID =new  mongoose.Types.ObjectId(createID); // Ensure it's an ObjectId
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [categories, counts] =
    await Promise.all([
      categoryRepo.getCategoriesWithFilters(query, skip, limit === 0 ? 0 : limit),
      categoryRepo.getCounts(query),
    ]);

  // Generate pagination metadata
  let meta = generateMeta(page, limit, counts.totalFiltered);
  meta.categoriesCount = { total: counts.total, active: counts.active, inactive: counts.inactive };
  // Format categories
  let formattedCategories = categories?.map((cat) => formatGlobalRewardCategory(cat));

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
  updated = formatGlobalRewardCategory(updatedCategory);
  return updated;
};

const deleteCategory = async (id) => {
  const updated = await categoryRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};



const getCategoriesTitleOnly = async ({ page, limit, keyword, status="active", date, createID }) => {
  const query = {};
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" }; // Exclude deleted categories
  }

  // Filter by creation date
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  // Filter by keyword in title
  if (keyword) {
    query.title = { $regex: keyword, $options: "i" };
  }

  // Filter by createID (user who created the category)
  if (createID) {
    query.createID =new  mongoose.Types.ObjectId(createID); // Ensure it's an ObjectId
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [categories, counts] =
    await Promise.all([
      categoryRepo.getCategoriesWithFiltersTitleonly(query, skip, limit === 0 ? 0 : limit),
      categoryRepo.getCounts(query),
    ]);

  let meta = generateMeta(page, limit, counts.totalFiltered);
  meta.categoriesCount = { total: counts.total, active: counts.active, inactive: counts.inactive };
  return {
    categories: categories,
    meta,
  };
};

module.exports = {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getCategoriesTitleOnly
};
