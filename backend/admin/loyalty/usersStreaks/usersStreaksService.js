// services/usersStreakService.js
const { generateMeta } = require("../../../helperUtils/responseUtil");
const usersStreakRepo = require("./usersStreaksRepository");
const { formatUsersStreaks } = require("./formatters/usersStreaksFormatter");
const { default: mongoose } = require("mongoose");

const createUsersStreak = async ({ user, companyOrganizer, visits = 0, points = 0 }) => {
  return await usersStreakRepo.createUsersStreak({ user, companyOrganizer, visits, points });
};

const getUsersStreaks = async ({
  companyOrganizer,
  page,
  limit,
  keyword,
  status,
  date,
  orderSort = "asc",
  sortBy,
  sortOrder
}) => {

  const query = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer)
  };

  // Date filter
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let [UsersStreaks, getUsersStreaksCounts] = await Promise.all([
    usersStreakRepo.getUsersStreaksWithFilters(query, skip, limit === 0 ? 0 : limit,sortBy, sortOrder),
    usersStreakRepo.getUsersStreaksCounts(query),
  ]);

  UsersStreaks = formatUsersStreaks(UsersStreaks);

  // ✅ Apply keyword filter AFTER populate
  if (keyword) {
    const lowerKeyword = keyword.toLowerCase();

    UsersStreaks = UsersStreaks.filter(item => {
      const user = item.user || {};

      return (
        user.firstName?.toLowerCase().includes(lowerKeyword) ||
        user.lastName?.toLowerCase().includes(lowerKeyword) ||
        user.username?.toLowerCase().includes(lowerKeyword) ||
        user.email?.toLowerCase().includes(lowerKeyword)
      );
    });
  }

  // ✅ Recalculate counts after filter
  const totalFiltered = UsersStreaks.length;

  const meta = generateMeta(page, limit, totalFiltered);
  meta.UsersStreaksCount = getUsersStreaksCounts;

  return { UsersStreaks, meta };
};

const getPublicUsersStreaks = async ({ page = 1, limit = 10, keyword, date, orderSort }) => {
  const baseFilters = [{ status: "active" }];

  //Date filter
  if (date) {
    baseFilters.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      },
    });
  }

  //Keyword filter
  if (keyword) {
    baseFilters.push({ title: { $regex: keyword, $options: "i" } });
  }

  const query = baseFilters.length ? { $and: baseFilters } : {};
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const sort = { order: orderSort === "desc" ? -1 : 1 };

  //only return selected fields
  const selectFields = "title image companyOrganizer";

  let [UsersStreaks, totalFiltered] = await Promise.all([
    usersStreakRepo.getUsersStreaksWithFilters(query, skip, limit === 0 ? 0 : limit, sort, selectFields),
    usersStreakRepo.countUsersStreaks(query),
  ]);

  UsersStreaks = formatUsersStreaks(UsersStreaks);

  const meta = generateMeta(page, limit, totalFiltered);

  return { UsersStreaks, meta };
};

const updateUsersStreak = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.visits !== undefined && { visits: data.visits }),
    ...(data.points !== undefined && { points: data.points }),
    ...(data.companyOrganizer !== undefined && { companyOrganizer: data.companyOrganizer }),
    ...(data.status !== undefined && { status: data.status }),
  };

  if (Object.keys(updateData).length === 0) {
    const usersStreak = await usersStreakRepo.findUsersStreakById(id).populate('user companyOrganizer');
    return usersStreak;
  }

  const updated = await usersStreakRepo.findByIdAndUpdate(id, updateData, { new: true }).populate('user companyOrganizer');
  return updated;
};

const deleteUsersStreak = async (id) => {
  const updated = await usersStreakRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  await usersStreakRepo.normalizeOrders();

  return true;
};

module.exports = {
  createUsersStreak,
  getUsersStreaks,
  updateUsersStreak,
  deleteUsersStreak,
  getPublicUsersStreaks,
};