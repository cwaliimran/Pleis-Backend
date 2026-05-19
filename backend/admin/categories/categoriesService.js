// services/categoryService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const Categories = require("./Categories");
const categoryRepo = require("./categoriesRepository");
const mongoose = require("mongoose");
const { formatCategories } = require("./formatters/categoryFormatter");
const { cache, invalidate } = require("@redisCache");

const createCategory = async ({ image, title, status }) => {
  return await categoryRepo.createCategory({ image, title, status });
};
const getCategories = async ({ page, limit, keyword, status, date, sortBy = "createdAt", sortOrder = "asc" }) => {
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

  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

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


const reorderCategory = async (movedId, previousOrder,
      newOrder) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (previousOrder > newOrder) {
      await Categories.updateMany(
        { order: { $gte: newOrder, $lt: previousOrder } },
        { $inc: { order: 1 } },
        { session }
      );
    } else {
      await Categories.updateMany(
        { order: { $gt: previousOrder, $lte: newOrder } },
        { $inc: { order: -1 } },
        { session }
      );
    }

    await Categories.findByIdAndUpdate(movedId, { order: newOrder }, { session });
    await session.commitTransaction();
    session.endSession();
    await invalidate("categories");
    return true;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

module.exports = {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getPublicCategories,
  reorderCategory,
};
