const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const MenuSubcategoryRepo = require("./menuSubcategoryRepository");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_MenuSubcategoryS_CACHE_KEY = "MenuSubcategory:active";
const createMenuSubcategory = async (data) => {
  let MenuSubcategory = await MenuSubcategoryRepo.createMenuSubcategory(data);
  return MenuSubcategory;
};
const getMenuSubcategorys = async ({
  page,
  limit,
  keyword,
  status,
  sortBy,
  sortOrder,
  summary,
  organization,
  companyOrganizer,
  timezone,
  isNullAllowed,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  if (summary) {
    let { MenuSubcategorys, meta } =
      await MenuSubcategoryRepo.getMenuSubcategorysSummary({
        timezone,
        page,
        limit,
        organization,
        companyOrganizer,
        skip,
        isNullAllowed,
      });
    return {
      MenuSubcategorys,
      meta,
    };
  }
  let { MenuSubcategorys, meta } =
    await MenuSubcategoryRepo.getMenuSubcategorys({
      timezone,
      page,
      limit,
      keyword,
      status,
      sortBy,
      sortOrder,
      summary,
      organization,
      companyOrganizer,
      skip,
      isNullAllowed,
    });

  return {
    MenuSubcategorys,
    meta,
  };
};
const updateMenuSubcategory = async (id, data) => {
  const MenuSubcategory = await MenuSubcategoryRepo.findMenuSubcategoryById(id);
  if (!MenuSubcategory) {
    return { error: "MenuSubcategory_not_found" };
  }

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "title",
    "organization",
    "companyOrganizer",
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
    return MenuSubcategory;
  }

  Object.assign(MenuSubcategory, updateData);
  await MenuSubcategory.save();
  await invalidate(ACTIVE_MenuSubcategoryS_CACHE_KEY);

  return MenuSubcategory;
};

const deleteMenuSubcategory = async (id) => {
  const updated = await MenuSubcategoryRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

module.exports = {
  createMenuSubcategory,
  getMenuSubcategorys,
  updateMenuSubcategory,
  deleteMenuSubcategory,
};
