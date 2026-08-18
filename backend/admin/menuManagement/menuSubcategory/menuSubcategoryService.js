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
    "order",
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

  if (Object.keys(updateData).length > 0) {
    Object.assign(MenuSubcategory, updateData);
    await MenuSubcategory.save();
    await invalidate(ACTIVE_MenuSubcategoryS_CACHE_KEY);
  }

  if (data.order !== undefined && data.order !== null && data.order !== "") {
    const targetOrder = Number(data.order);
    if (!Number.isFinite(targetOrder)) {
      return { error: "invalid_order" };
    }
    return MenuSubcategoryRepo.reorderMenuSubcategory(id, targetOrder);
  }

  if (data.order !== undefined && data.order !== null && data.order !== "") {
    const targetOrder = Number(data.order);
    if (!Number.isFinite(targetOrder)) {
      return { error: "invalid_order" };
    }
    return MenuSubcategoryRepo.reorderMenuSubCategory(id, targetOrder);
  }

  return MenuSubcategory;
};

const deleteMenuSubcategory = async (id) => {
  const updated = await MenuSubcategoryRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const reorderMenuSubCategory = async (movedId, newOrder) => {
  const moved = await MenuSubcategoryRepo.reorderMenuSubCategory(
    movedId,
    newOrder,
  );
  if (!moved) {
    throw new Error("MenuItemSubCategory_not_found");
  }
  return moved;
};
module.exports = {
  createMenuSubcategory,
  getMenuSubcategorys,
  updateMenuSubcategory,
  deleteMenuSubcategory,
  reorderMenuSubCategory,
};
