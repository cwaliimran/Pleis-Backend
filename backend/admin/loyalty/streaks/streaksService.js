// services/streakService.js
const { generateMeta } = require("../../../helperUtils/responseUtil");
const streakRepo = require("./streaksRepository");
const { formatStreaks } = require("./formatters/streaksFormatter");
const { default: mongoose } = require("mongoose");

const createStreak = async ({ visits = 0, points = 0, companyOrganizer, status }) => {
  return await streakRepo.createStreak({ visits, points, companyOrganizer, status });
};

const getStreaks = async ({ companyOrganizer, page, limit, keyword, status, date, orderSort = "asc" }) => {
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

  let [streaks, getStreaksCounts] = await Promise.all([
    streakRepo.getStreaksWithFilters(query, skip, limit === 0 ? 0 : limit, sort),
    streakRepo.getStreaksCounts(query),
  ]);

  const { totalFiltered, total, active, inactive } = getStreaksCounts;
  const meta = generateMeta(page, limit, totalFiltered);
  meta.streaksCount = { total, active, inactive };

  // streaks = formatStreaks(streaks);

  return { streaks, meta };
};

const getPublicStreaks = async ({ page = 1, limit = 10, keyword, date, orderSort }) => {
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

  let [streaks, totalFiltered] = await Promise.all([
    streakRepo.getStreaksWithFilters(query, skip, limit === 0 ? 0 : limit, sort, selectFields),
    streakRepo.countStreaks(query),
  ]);

  streaks = formatStreaks(streaks);

  const meta = generateMeta(page, limit, totalFiltered);

  return { streaks, meta };
};

const updateStreak = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.visits !== undefined && { visits: data.visits }),
    ...(data.points !== undefined && { points: data.points }),
    ...(data.companyOrganizer !== undefined && { companyOrganizer: data.companyOrganizer }),
    ...(data.status !== undefined && { status: data.status }),
  };

  if (Object.keys(updateData).length === 0) {
    const streak = await streakRepo.findStreakById(id);
    return streak;
  }

  const updated = await streakRepo.findByIdAndUpdate(id, updateData);
  return updated;
};

const deleteStreak = async (id) => {
  const updated = await streakRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};


module.exports = {
  createStreak,
  getStreaks,
  updateStreak,
  deleteStreak,
  getPublicStreaks,
};