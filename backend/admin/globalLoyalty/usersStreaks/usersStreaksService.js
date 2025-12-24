// services/usersStreakService.js
const { generateMeta } = require("../../../helperUtils/responseUtil");
const usersStreakRepo = require("./usersStreaksRepository");
const { formatUsersStreaks } = require("./formatters/UsersStreaksFormatter");
const { default: mongoose } = require("mongoose");

const createUsersStreak = async ({ user, companyOrganizer, visits = 0, points = 0 }) => {
  return await usersStreakRepo.createUsersStreak({ user, companyOrganizer, visits, points });
};

const getUsersStreaks = async ({ companyOrganizer, page, limit, keyword, status, date, orderSort = "asc" }) => {
  const query = {};

  // Date filter (optional)
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  // Filter by companyOrganizer if provided
  if (companyOrganizer) {
    query.companyOrganizer = companyOrganizer;
  }

  // Filter by status (active, inactive, etc.)
  query.status = status ? status : { $ne: "deleted" };

  // Pagination setup
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Sorting order
  const sort = { order: orderSort === "desc" ? -1 : 1 };

  // Fetch data using getUsersStreaksWithFilters function
  let [UsersStreaks, getUsersStreaksCounts] = await Promise.all([
    usersStreakRepo.getUsersStreaksWithFilters(query, skip, limit === 0 ? 0 : limit, sort),
    usersStreakRepo.getUsersStreaksCounts(query),
  ]);

  // Apply keyword search on the fetched results
  if (keyword) {
    const sanitizedKeyword = String(keyword).trim();  // Sanitize keyword

    UsersStreaks = UsersStreaks.filter((streak) => {
      // Convert numeric fields to string before applying `.toLowerCase()` for keyword search
      return (
        (streak.user.firstName && streak.user.firstName.toLowerCase().includes(sanitizedKeyword.toLowerCase())) ||
        (streak.user.lastName && streak.user.lastName.toLowerCase().includes(sanitizedKeyword.toLowerCase())) ||
        (streak.user.username && streak.user.username.toLowerCase().includes(sanitizedKeyword.toLowerCase())) ||
        (streak.user.email && streak.user.email.toLowerCase().includes(sanitizedKeyword.toLowerCase())) ||
        // Add keyword check for numeric fields as well (visits, streaks, points, longestStreak)
        (String(streak.visits).includes(sanitizedKeyword)) || 
        (String(streak.streak).includes(sanitizedKeyword)) ||
        (String(streak.points).includes(sanitizedKeyword)) ||
        (String(streak.longestStreak).includes(sanitizedKeyword))
      );
    });
  }

  // Attach organization details if needed
  UsersStreaks = await usersStreakRepo.attachOrganizationDetailsToStreaks(UsersStreaks);

  const { totalFiltered, total, active, inactive } = getUsersStreaksCounts;
  const meta = generateMeta(page, limit, totalFiltered);
  meta.UsersStreaksCount = { total, active, inactive };

  // Format data before returning
  UsersStreaks = formatUsersStreaks(UsersStreaks);

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