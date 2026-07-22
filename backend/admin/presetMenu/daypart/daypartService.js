const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const AllergenRepo = require("./daypartRepository");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_AllergenS_CACHE_KEY = "Allergen:active";
const createAllergen = async (data) => {
  let Allergen = await AllergenRepo.createAllergen(data);
  return Allergen;
};
const getAllergens = async ({
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
    let { Allergens, meta } = await AllergenRepo.getAllergensSummary({
      timezone,
      page,
      limit,
      user,
      skip,
    });
    return {
      Allergens,
      meta,
    };
  }
  let { Allergens, meta } = await AllergenRepo.getAllergens({
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
    Allergens,
    meta,
  };
};
const updateAllergen = async (id, data) => {
  const Allergen = await AllergenRepo.findAllergenById(id);
  if (!Allergen) {
    return { error: "Allergen_not_found" };
  }

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "name",
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
    return Allergen;
  }

  Object.assign(Allergen, updateData);
  await Allergen.save();
  await invalidate(ACTIVE_AllergenS_CACHE_KEY);

  return Allergen;
};

const deleteAllergen = async (id) => {
  const updated = await AllergenRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};
const getAllergenCode = async () => {
  const code = await AllergenRepo.generateUniqueAllergenCode();
  return code;
};
module.exports = {
  createAllergen,
  getAllergens,
  updateAllergen,
  deleteAllergen,
  getAllergenCode,
};

