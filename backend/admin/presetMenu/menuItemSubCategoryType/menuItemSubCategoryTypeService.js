const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const formatMenuItemSubCategoryTypeTimes = require("./formator/formatMenuItemSubCategoryTypeTimes");
const MenuItemSubCategoryTypeRepo = require("./menuItemSubCategoryTypeRepository");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_MenuItemSubCategoryTypeS_CACHE_KEY = "MenuItemSubCategoryType:active";
const createMenuItemSubCategoryType = async (data) => {
  let MenuItemSubCategoryType =
    await MenuItemSubCategoryTypeRepo.createMenuItemSubCategoryType(data);
  return MenuItemSubCategoryType;
};
const getMenuItemSubCategoryTypes = async ({
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
    let { MenuItemSubCategoryTypes, meta } =
      await MenuItemSubCategoryTypeRepo.getMenuItemSubCategoryTypesSummary({
        timezone,
        page,
        limit,
        user,
        skip,
      });

    return {
      MenuItemSubCategoryTypes: MenuItemSubCategoryTypes.map((d) =>
        formatMenuItemSubCategoryTypeTimes(d, timezone),
      ),
      meta,
    };
  }
  let { MenuItemSubCategoryTypes, meta } =
    await MenuItemSubCategoryTypeRepo.getMenuItemSubCategoryTypes({
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
    MenuItemSubCategoryTypes: MenuItemSubCategoryTypes.map((d) =>
      formatMenuItemSubCategoryTypeTimes(d, timezone),
    ),
    meta,
  };
};
const updateMenuItemSubCategoryType = async (id, data) => {
  const MenuItemSubCategoryType =
    await MenuItemSubCategoryTypeRepo.findMenuItemSubCategoryTypeById(id);
  if (!MenuItemSubCategoryType) {
    return { error: "MenuItemSubCategoryType_not_found" };
  }

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = ["name", "status", "category", "order"];

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
    return MenuItemSubCategoryType;
  }

  Object.assign(MenuItemSubCategoryType, updateData);
  await MenuItemSubCategoryType.save();
  await invalidate(ACTIVE_MenuItemSubCategoryTypeS_CACHE_KEY);

  return MenuItemSubCategoryType;
};

const deleteMenuItemSubCategoryType = async (id) => {
  const updated = await MenuItemSubCategoryTypeRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};
const getMenuItemSubCategoryTypeCode = async () => {
  const code =
    await MenuItemSubCategoryTypeRepo.generateUniqueMenuItemSubCategoryTypeCode();
  return code;
};

const reorderMenuItemSubCategoryType = async (movedId, newOrder, user) => {
  const moved = await MenuItemSubCategoryTypeRepo.reorderMenuItemSubCategoryType(
    movedId,
    newOrder,
    user,
  );
  if (!moved) {
    throw new Error("MenuItemSubCategoryType_not_found");
  }
  return moved;
};

module.exports = {
  createMenuItemSubCategoryType,
  getMenuItemSubCategoryTypes,
  updateMenuItemSubCategoryType,
  deleteMenuItemSubCategoryType,
  getMenuItemSubCategoryTypeCode,
  reorderMenuItemSubCategoryType,
};
