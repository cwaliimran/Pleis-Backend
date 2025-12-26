const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const BadgeCategoriesRepo = require("./badgeCategoriesRepository");


const createBadgeCategories = async (data) => {
  let badgeCategories = await BadgeCategoriesRepo.createBadgeCategories(data);
  return badgeCategories;
};
const getBadgeCategoriess = async ({ timezone, page, limit, keyword, status, userId,  date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { BadgeCategoriess, meta } = await BadgeCategoriesRepo.getBadgeCategoriess({ timezone, page, limit, keyword, status, userId,  date, range, today, skip });

  return {
    BadgeCategoriess,
    meta
  };
};
const updateBadgeCategories = async (id, data) => {
  const badge = await BadgeCategoriesRepo.findBadgeCategoriesById(id);

  if (!badge) {
    return { error: "Badge_not_found" };
  }

  /* ================= ALLOWED FIELDS ================= */

  const allowedFields = [
    "title",
    "description",
    "icon",
    "category",
    "condition",
    "points",
    "status",
  ];

  /* ================= APPLY UPDATE FIELDS ================= */

  const updateData = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  // Nothing to update
  if (Object.keys(updateData).length === 0) {
    return badge;
  }

  /* ================= APPLY & SAVE ================= */

  Object.assign(badge, updateData);
  await badge.save(); // schema validation runs here

  return badge;
};

const deleteBadgeCategories = async (id) => {
  if (!id) throw new Error("BadgeCategories ID is required");
  const deleted = await BadgeCategoriesRepo.updateBadgeStatusById(
    id,
    "deleted"
  );
  return !!deleted;
};
module.exports = {
  createBadgeCategories,
  getBadgeCategoriess,
  updateBadgeCategories,
  deleteBadgeCategories,

};