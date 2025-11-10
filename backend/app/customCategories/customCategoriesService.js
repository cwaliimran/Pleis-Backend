// app/customCategoryService.js
const { getFullImageUrl } = require("../../helperUtils/imageHelper");
const { User } = require("../../models/UserModel");
const customCategoryRepo = require("./customCategoriesRepository");
const { formatCustomCategoryEventResponse } = require("./formatter/eventFormatter");


// Service layer
const getCustomCategories = async ({
  userLocation,
  userId,
  timezone,
  page = 1,
  limit = 10,
  keyword,
  status,
  date,
  orderSort = "asc",
  category,
  time
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
  let [customCategories] = await Promise.all([
    customCategoryRepo.getCustomCategoriesWithFilters(
      userId,
      timezone,
      query,
      skip,
      limit === 0 ? 0 : limit,
      sort,
      category,
      time
    ),
  ]);


  // Remove categories with no objects
  customCategories = customCategories.filter(category => {
    if (!category?.objects || category.objects.length === 0) {
      return false;
    }
    return true;
  });

  // Apply transformations to objects
  customCategories.forEach((category) => {
    category.objects = category.objects.map((obj) => {
      if (!obj) return null;
      let mObj = transformObject(obj, category.type, userLocation, timezone);
      return mObj;
    });
  });


  return {
    customCategories,
  };
};

/**
 * Transform objects based on their type
 * Applies icon paths, URLs, and removes sensitive data
 */
const transformObject = (obj, type, userLocation, timezone) => {
  obj.type = type;
  if (type === "User") {
    return new User(obj).toJSON(obj);
  } else if (type === "Event") {
    return formatCustomCategoryEventResponse(obj, { userLocation, timezone });

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
    transformed.basicInfo.media.logo = getFullImageUrl("noimage.png");
  }

  // Cover image (optional)
  if (transformed.basicInfo.media.cover) {
    transformed.basicInfo.media.cover = transformed.basicInfo.media.cover.startsWith("http")
      ? transformed.basicInfo.media.cover
      : getFullImageUrl(transformed.basicInfo.media.cover);
  }

  return transformed;
};

module.exports = {
  getCustomCategories,
};