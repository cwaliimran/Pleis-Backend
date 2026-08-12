// services/streakService.js
const { generateMeta } = require("../../../helperUtils/responseUtil");
const streakRepo = require("./streaksRepository");
const { formatStreaks } = require("./formatters/streaksFormatter");
const { default: mongoose } = require("mongoose");

const createStreak = async ({ visits = 0, points = 0, companyOrganizer, status }) => {
  return await streakRepo.createStreak({ visits, points, companyOrganizer, status });
};

const getStreaks = async ({ companyOrganizer }) => {
  const query = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer)
  };
  query.status = { $ne: "deleted" };
  const streaks = await streakRepo.getStreaksWithFilters(query);
  return streaks
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

const updateStreak = async ( countBase, badges, companyOrganizer, status) => {
  const existingStreak =
    await streakRepo.findStreakByCompanyOrganizer(companyOrganizer);
    if(!existingStreak) {
     const createdStreak = await streakRepo.createStreak({ countBase, badges, companyOrganizer, status });
      return createdStreak;
    }
  const updateData = {
    ...(countBase !== undefined && { countBase }),
    ...(badges !== undefined && { badges }),
    ...(companyOrganizer !== undefined && { companyOrganizer }),
    ...(status !== undefined && { status }),
  };
  const updatedStreak = await streakRepo.updateStreakData(
    updateData,
  );
  return updatedStreak;
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