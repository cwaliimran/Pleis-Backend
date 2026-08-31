const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const BrandRepo = require("./brandRepository");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_BRANDS_CACHE_KEY = "Brand:active";
const createBrand = async (data) => {
  let Brand = await BrandRepo.createBrand(data);
  return Brand;
};
const getBrands = async ({
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
    let { Brands, meta } = await BrandRepo.getBrandsSummary({
      timezone,
      page,
      limit,
      user,
      skip,
      keyword,
    });
    return {
      Brands,
      meta,
    };
  }
  let { Brands, meta } = await BrandRepo.getBrands({
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
    Brands,
    meta,
  };
};
const updateBrand = async (id, data) => {
  const Brand = await BrandRepo.findBrandById(id);
  if (!Brand) {
    return { error: "Brand_not_found" };
  }

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "name",
    "brandOwner",
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
    return Brand;
  }

  Object.assign(Brand, updateData);
  await Brand.save();
  await invalidate(ACTIVE_BRANDS_CACHE_KEY);

  return Brand;
};

const deleteBrand = async (id) => {
  const updated = await BrandRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

module.exports = {
  createBrand,
  getBrands,
  updateBrand,
  deleteBrand,
};
