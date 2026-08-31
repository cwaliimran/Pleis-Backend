const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const ServingRepo = require("./servingRepository");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_ServingS_CACHE_KEY = "Serving:active";
const createServing = async (data) => {
  let Serving = await ServingRepo.createServing(data);
  return Serving;
};
const getServings = async ({
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
    let { Servings, meta } = await ServingRepo.getServingsSummary({
      timezone,
      page,
      limit,
      user,
      skip,
      keyword,
    });
    return {
      Servings,
      meta,
    };
  }
  let { Servings, meta } = await ServingRepo.getServings({
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
    Servings,
    meta,
  };
};
const updateServing = async (id, data) => {
  const Serving = await ServingRepo.findServingById(id);
  if (!Serving) {
    return { error: "Serving_not_found" };
  }

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "level2",
    "type",
    "unit",
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
    return Serving;
  }

  Object.assign(Serving, updateData);
  await Serving.save();
  await invalidate(ACTIVE_ServingS_CACHE_KEY);

  return Serving;
};

const deleteServing = async (id) => {
  const updated = await ServingRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};
const getServingCode = async () => {
  const code = await ServingRepo.generateUniqueServingCode();
  return code;
};
module.exports = {
  createServing,
  getServings,
  updateServing,
  deleteServing,
  getServingCode,
};

