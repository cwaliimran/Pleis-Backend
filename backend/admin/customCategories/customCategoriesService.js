// services/customCategoryService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const CustomCategories = require("./CustomCategories");
const customCategoryRepo = require("./customCategoriesRepository");
const mongoose = require("mongoose");

const createCustomCategory = async ({ title, type, objects, status }) => {
  return await customCategoryRepo.createCustomCategory({ title, type, objects, status });
};

const getCustomCategories = async ({ page, limit, keyword, status, date, orderSort = "asc" }) => {
  const query = {};

  // ✅ Filter by status
  query.status = status ? status : { $ne: "deleted" };

  // ✅ Date filter (format: yyyy-mm-dd)
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  // ✅ Keyword search
  if (keyword) {
    query.$or = [{ title: { $regex: keyword, $options: "i" } }];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const sort = { order: orderSort === "desc" ? -1 : 1 };

  const [customCategories, totalFiltered, total, active, inactive] = await Promise.all([
    customCategoryRepo.getCustomCategoriesWithFilters(query, skip, limit === 0 ? 0 : limit, sort),
    customCategoryRepo.countCustomCategories(query),
    customCategoryRepo.countCustomCategories({ status: { $ne: "deleted" } }),
    customCategoryRepo.countCustomCategories({ status: "active" }),
    customCategoryRepo.countCustomCategories({ status: "inactive" }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.customCategoriesCount = { total, active, inactive };

  return { customCategories, meta };
};

const updateCustomCategory = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.objects !== undefined && { objects: data.objects }),
    ...(data.type !== undefined && { type: data.type }),
  };

  if (Object.keys(updateData).length === 0) {
    const customCategory = await customCategoryRepo.findCustomCategoryById(id).populate('objects');
    return customCategory;
  }

  const updated = await customCategoryRepo.findByIdAndUpdate(id, updateData, { new: true }).populate('objects');
  return updated;
};

const deleteCustomCategory = async (id) => {
  const updated = await customCategoryRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  await customCategoryRepo.normalizeOrders();

  return true;
};

const reorderCustomCategory = async (movedId, previousOrder, newOrder) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (previousOrder > newOrder) {
      await CustomCategories.updateMany(
        { order: { $gte: newOrder, $lt: previousOrder } },
        { $inc: { order: 1 } },
        { session }
      );
    } else {
      await CustomCategories.updateMany(
        { order: { $gt: previousOrder, $lte: newOrder } },
        { $inc: { order: -1 } },
        { session }
      );
    }

    await CustomCategories.findByIdAndUpdate(movedId, { order: newOrder }, { session });
    await session.commitTransaction();
    session.endSession();
    return true;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

module.exports = {
  createCustomCategory,
  getCustomCategories,
  updateCustomCategory,
  deleteCustomCategory,
  reorderCustomCategory,
};