// services/usersStreakService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const usersStreakRepo = require("./usersStreaksRepository");
const { formatUsersStreaks } = require("./formatters/usersStreaksFormatter");
const { default: mongoose } = require("mongoose");
const UserStreaks = require("@UsersStreaksModel");
const createUsersStreak = async ({ user, companyOrganizer, organization}) => {
  return await usersStreakRepo.createUsersStreak({ user, companyOrganizer, organization });
};

const getUsersUsersStreaks = async ({ companyOrganizer, page, limit, keyword, status, date, orderSort = "asc" }) => {
  const query = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer)
  };

  //Filter by status
  query.status = status ? status : { $ne: "deleted" };

  //Date filter (format: yyyy-mm-dd)
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  //Keyword search
  if (keyword) {
    query.$or = [{ title: { $regex: keyword, $options: "i" } }];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const sort = { order: orderSort === "desc" ? -1 : 1 };

  let [usersUsersStreaks, getUsersUsersStreaksCounts] = await Promise.all([
    usersStreakRepo.getUsersUsersStreaksWithFilters(query, skip, limit === 0 ? 0 : limit, sort),
    usersStreakRepo.getUsersUsersStreaksCounts(query),
  ]);

  const { totalFiltered, total, active, inactive } = getUsersUsersStreaksCounts;
  const meta = generateMeta(page, limit, totalFiltered);
  meta.usersUsersStreaksCount = { total, active, inactive };

  // usersUsersStreaks = formatUsersUsersStreaks(usersUsersStreaks);

  return { usersUsersStreaks, meta };
};

const getPublicUsersUsersStreaks = async ({ page = 1, limit = 10, keyword, date, orderSort }) => {
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

  let [usersUsersStreaks, totalFiltered] = await Promise.all([
    usersStreakRepo.getUsersUsersStreaksWithFilters(query, skip, limit === 0 ? 0 : limit, sort, selectFields),
    usersStreakRepo.countUsersUsersStreaks(query),
  ]);

  // usersUsersStreaks = formatUsersUsersStreaks(usersUsersStreaks);

  const meta = generateMeta(page, limit, totalFiltered);

  return { usersUsersStreaks, meta };
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
const getUserMaxStreak = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {

    return 0;
  }

  const result = await UserStreaks.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId)
      }
    },
    {
      $group: {
        _id: null,
        maxStreak: { $max: { $ifNull: ["$streak", 0] } }
      }
    }
  ]);



  // ✅ Always return number
  return result?.[0]?.maxStreak ?? 0;
};

const checkoutUsersStreak = async (data) => {

  try {
    const userStreak = await usersStreakRepo.checkoutUsersStreak(data);

    return userStreak;
  } catch (error) {
    throw error;
  }
};


module.exports = {
  createUsersStreak,
  getUsersUsersStreaks,
  updateUsersStreak,
  deleteUsersStreak,
  getPublicUsersUsersStreaks,
  getUserMaxStreak,
  checkoutUsersStreak
};