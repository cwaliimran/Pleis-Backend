// services/categoryService.js
const { generateMeta } = require("@utils/responseUtil");
const categoryRepo = require("./GlobalRewardCategoriesRepository");
const { formatMenuItem } = require("./formatter/formatItemCategories");
const mongoose = require("mongoose");
const createCategory = async ({ image, title, status,createID }) => {
  let category = await categoryRepo.createCategory({ image, title, status, createID });
  return formatMenuItem(category);
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

  const [categories, totalFiltered, total, active, inactive] =
    await Promise.all([
      categoryRepo.getCategoriesWithFilters(query, skip, limit === 0 ? 0 : limit),
      categoryRepo.countCategories(query),
      categoryRepo.countCategories({ status: { $ne: "deleted" } }),
      categoryRepo.countCategories({ status: "active" }),
      categoryRepo.countCategories({ status: "inactive" }),
    ]);

  // Generate pagination metadata
  let meta = generateMeta(page, limit, totalFiltered);
  meta.categoriesCount = { total, active, inactive };

  // Format categories
  let formattedCategories = categories?.map((cat) => formatMenuItem(cat));

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
  updated = formatMenuItem(updatedCategory);
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
};
