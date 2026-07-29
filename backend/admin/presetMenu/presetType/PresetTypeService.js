const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const presetTypeRepo = require("./PresetTypeRepository");
const { formatImageFieldsList } = require("./formator/imageUrlFormatter");
const { cache, invalidate } = require("@redisCache");
const MenuItemSubCategory = require("@MenuItemSubCategoriesModel");
const ACTIVE_presetTypeS_CACHE_KEY = "presetType:active";
const createpresetType = async (data) => {
  // Always persist category from the selected subcategory
  if (data.subCategory) {
    const subCategory = await MenuItemSubCategory.findById(data.subCategory)
      .select("category")
      .lean();
    if (!subCategory?.category) {
      return { error: "subCategory_not_found_or_missing_category" };
    }
    data.category = subCategory.category;
  }

  let presetType = await presetTypeRepo.createpresetType(data);
  return presetType;
};
const getpresetTypes = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  date,
  sortBy,
  sortOrder,
  summary,
  category,
  subCategory,
  type,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  if (summary) {
    let { presetTypes, meta } = await presetTypeRepo.getpresetTypesSummary({
      timezone,
      page,
      limit,
      user,
      skip,
    });
    return {
      presetTypes,
      meta,
    };
  }
  let { presetTypes, meta } = await presetTypeRepo.getpresetTypes({
    timezone,
    page,
    limit,
    keyword,
    status,
    user,
    date,
    skip,
    sortBy,
    sortOrder,
    category,
    subCategory,
    type,
  });

  return {
    presetTypes: formatImageFieldsList(presetTypes),
    meta,
  };
};
const updatepresetType = async (id, data) => {
  const presetType = await presetTypeRepo.findpresetTypeById(id);
  if (!presetType) {
    return { error: "presetType_not_found" };
  }

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "name",
    "description",
    "status",
  ];


  // -----------------------------
  // APPLY UPDATE FIELDS
  // -----------------------------
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return presetType;
  }

  Object.assign(presetType, updateData);
  await presetType.save();
  await invalidate(ACTIVE_presetTypeS_CACHE_KEY);

  return presetType;
};

const deletepresetType = async (id) => {
  const updated = await presetTypeRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};
const getpresetTypeCode = async () => {
  const code = await presetTypeRepo.generateUniquepresetTypeCode();
  return code;
};
module.exports = {
  createpresetType,
  getpresetTypes,
  updatepresetType,
  deletepresetType,
  getpresetTypeCode,
};

