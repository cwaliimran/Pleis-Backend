// services/customCategoryService.js
const { Events } = require("../../commonModules/events/Event");
const { formatEventResponse } = require("../../commonModules/events/formatter/eventFormatter");
const Organizations = require("../../commonModules/organizations/Organization");
const { getFullImageUrl } = require("../../helperUtils/imageHelper");
const { generateMeta, convertUtcToTimezone } = require("../../helperUtils/responseUtil");
const { User } = require("../../models/UserModel");
const CustomCategories = require("./CustomCategories");
const customCategoryRepo = require("./customCategoriesRepository");
const mongoose = require("mongoose");

const createCustomCategory = async ({ title, type, objects, status, order }) => {
  return await customCategoryRepo.createCustomCategory({ title, type, objects, status, order });
};



// Service layer
const getCustomCategories = async ({
  timezone,
  page = 1,
  limit = 10,
  keyword,
  status,
  date,
  orderSort = "asc",
}) => {
  const query = {};

  // Filter by status
  query.status = status ? status : { $ne: "deleted" };

  // Date filter (format: yyyy-mm-dd)
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  // Keyword search
  if (keyword) {
    query.$or = [{ title: { $regex: keyword, $options: "i" } }];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const sort = { order: orderSort === "desc" ? -1 : 1 };

  // Fetch custom categories and counts using aggregation
  const [customCategories, customCategoriesCounts] = await Promise.all([
    customCategoryRepo.getCustomCategoriesWithFilters(
      timezone,
      query,
      skip,
      limit === 0 ? 0 : limit,
      sort
    ),
    customCategoryRepo.getCustomCategoriesCounts(query),
  ]);

  // Generate meta information
  const meta = {
    currentPage: limit === 0 ? 1 : Math.floor(skip / limit) + 1,
    totalPages: limit === 0 ? 1 : Math.ceil(customCategoriesCounts.totalFiltered / limit),
    totalRecords: customCategoriesCounts.totalFiltered,
    limit: limit,
    customCategoriesCount: {
      total: customCategoriesCounts.total,
      active: customCategoriesCounts.active,
      inactive: customCategoriesCounts.inactive,
    },
  };

  // Check if objects are populated correctly and apply transformations
  customCategories.forEach((category) => {
    if (category?.objects?.length === 0) {
      console.log(`No objects found for category ${category._id}`);
    }

    category.objects = category.objects.map((obj) => {
      if (!obj) return null;
      return transformObject(obj, category.type, timezone);
    });
  });


  return {
    customCategories,
    meta,
  };
};


/**
 * Transform objects based on their type
 * Applies icon paths, URLs, and removes sensitive data
 */
const transformObject = (obj, type, timezone) => {
    obj.type = type;
  if (type === "User") {
    return new User(obj).toJSON(obj);
  } else if (type === "Event") {

    return formatEventResponse(obj, timezone);

    // return new Events(obj).toPublicJSON(obj);
  } else if (type === "Organizations") {
    return transformOrganization(obj);
  }

  return obj;
};


/**
 * Transform organization object - attach icon/logo/cover URLs
 */
const transformOrganization = (organization) => {
  const transformed = { ...organization };

  if (!transformed.basicInfo) return transformed;

  // Ensure media exists on basicInfo
  transformed.basicInfo.media = transformed.basicInfo.media || {};

  // Logo now lives under basicInfo.media.logo per schema
  if (transformed.basicInfo.media.logo) {
    transformed.basicInfo.media.logo = transformed.basicInfo.media.logo.startsWith("http")
      ? transformed.basicInfo.media.logo
      : getFullImageUrl(transformed.basicInfo.media.logo);
  } else {
    // default logo when missing/empty
    transformed.basicInfo.media.logo = getFullImageUrl("noImage.png");
  }

  // Cover image (optional)
  if (transformed.basicInfo.media.cover) {
    transformed.basicInfo.media.cover = transformed.basicInfo.media.cover.startsWith("http")
      ? transformed.basicInfo.media.cover
      : getFullImageUrl(transformed.basicInfo.media.cover);
  }

  return transformed;
};
// Function to get Mongoose model based on type
const getModelFromType = (type) => {
  switch (type) {
    case "Event":
      return Events
    case "User":
      return User
    case "Organizations":
      return Organizations
    default:
      throw new Error(`Unknown type: ${type}`);
  }
};


const updateCustomCategory = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.objects !== undefined && { objects: data.objects }),
    ...(data.type !== undefined && { type: data.type }),
    ...(data.order !== undefined && { order: data.order }),
  };

  if (Object.keys(updateData).length === 0) {
    const customCategory = await customCategoryRepo.findCustomCategoryById(id).populate('objects');
    return customCategory;
  }

  const updated = await customCategoryRepo.findByIdAndUpdate(id, updateData, { new: true });
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