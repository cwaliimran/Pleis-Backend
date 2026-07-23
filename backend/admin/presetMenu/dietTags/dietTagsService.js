const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const DietTagsRepo = require("./dietTagsRepository");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_DietTagsS_CACHE_KEY = "DietTags:active";
const createDietTags = async (data) => {
  let DietTags = await DietTagsRepo.createDietTags(data);
  return DietTags;
};
const getDietTagss = async ({
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
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  if (summary) {
    let { DietTagss, meta } = await DietTagsRepo.getDietTagssSummary({
      timezone,
      page,
      limit,
      user,
      skip,
    });
    return {
      DietTagss,
      meta,
    };
  }
  let { DietTagss, meta } = await DietTagsRepo.getDietTagss({
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
  });

  return {
    DietTagss,
    meta,
  };
};
const updateDietTags = async (id, data) => {
  const DietTags = await DietTagsRepo.findDietTagsById(id);
  if (!DietTags) {
    return { error: "DietTags_not_found" };
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
    return DietTags;
  }

  Object.assign(DietTags, updateData);
  await DietTags.save();
  await invalidate(ACTIVE_DietTagsS_CACHE_KEY);

  return DietTags;
};

const deleteDietTags = async (id) => {
  const updated = await DietTagsRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};
const getDietTagsCode = async () => {
  const code = await DietTagsRepo.generateUniqueDietTagsCode();
  return code;
};
module.exports = {
  createDietTags,
  getDietTagss,
  updateDietTags,
  deleteDietTags,
  getDietTagsCode,
};

