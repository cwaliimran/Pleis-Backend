const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const formatMenuItemSubCategoryTimes = require("./formator/formatMenuItemSubCategoryTimes");
const MenuItemSubCategoryRepo = require("./menuItemSubCategoriesRepository");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_MenuItemSubCategoryS_CACHE_KEY = "MenuItemSubCategory:active";
const createMenuItemSubCategory = async (data) => {
  let MenuItemSubCategory =
    await MenuItemSubCategoryRepo.createMenuItemSubCategory(data);
  return MenuItemSubCategory;
};
const getMenuItemSubCategorys = async ({
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
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  if (summary) {
    let { MenuItemSubCategorys, meta } =
      await MenuItemSubCategoryRepo.getMenuItemSubCategorysSummary({
        timezone,
        page,
        limit,
        user,
        skip,
        category,
      });

    return {
      MenuItemSubCategorys: MenuItemSubCategorys.map((d) =>
        formatMenuItemSubCategoryTimes(d, timezone),
      ),
      meta,
    };
  }
  let { MenuItemSubCategorys, meta } =
    await MenuItemSubCategoryRepo.getMenuItemSubCategorys({
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
    });

  return {
    MenuItemSubCategorys: MenuItemSubCategorys.map((d) =>
      formatMenuItemSubCategoryTimes(d, timezone),
    ),
    meta,
  };
};
const updateMenuItemSubCategory = async (id, data) => {
  const MenuItemSubCategory =
    await MenuItemSubCategoryRepo.findMenuItemSubCategoryById(id);
  if (!MenuItemSubCategory) {
    return { error: "MenuItemSubCategory_not_found" };
  }

  const allowedFields = ["name", "status", "category"];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length > 0) {
    Object.assign(MenuItemSubCategory, updateData);
    await MenuItemSubCategory.save();
    await invalidate(ACTIVE_MenuItemSubCategoryS_CACHE_KEY);
  }

  if (data.order !== undefined && data.order !== null && data.order !== "") {
    const targetOrder = Number(data.order);
    if (!Number.isFinite(targetOrder)) {
      return { error: "invalid_order" };
    }
    return MenuItemSubCategoryRepo.reorderMenuItemSubCategory(id, targetOrder);
  }

  return MenuItemSubCategory;
};

const deleteMenuItemSubCategory = async (id) => {
  const updated = await MenuItemSubCategoryRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};
const getMenuItemSubCategoryCode = async () => {
  const code =
    await MenuItemSubCategoryRepo.generateUniqueMenuItemSubCategoryCode();
  return code;
};

const reorderMenuItemSubCategory = async (movedId, newOrder) => {
  const moved = await MenuItemSubCategoryRepo.reorderMenuItemSubCategory(
    movedId,
    newOrder,
  );
  if (!moved) {
    throw new Error("MenuItemSubCategory_not_found");
  }
  return moved;
};

module.exports = {
  createMenuItemSubCategory,
  getMenuItemSubCategorys,
  updateMenuItemSubCategory,
  deleteMenuItemSubCategory,
  getMenuItemSubCategoryCode,
  reorderMenuItemSubCategory,
};
