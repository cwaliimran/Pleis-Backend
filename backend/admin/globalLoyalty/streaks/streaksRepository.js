// repositories/streakRepository.js
const Streaks = require("@GlobalStreaksModel");
const { getModelCounts } = require("@dbUtils/queryUtil");

// Create
// Create streak and automatically assign next order
const createStreak = async (data) => {
  const streak = new Streaks(data);
  return await streak.save();
};

// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const getStreaksWithFilters = async (
  filter,
  skip,
  limit,
  sort = { order: 1 },
  selectFields = null
) => {
  const query = Streaks.find(filter).sort(sort);

  if (selectFields) query.select(selectFields); // apply select dynamically
  if (limit > 0) query.skip(skip).limit(limit);

  return query.exec();
};

// Count by condition
const countStreaks = async (query = {}) => {
  return Streaks.countDocuments(query);
};

const getStreaksCounts = async (query) => {
  return getModelCounts({ model: Streaks, filterQuery: query });
}


// Find by ID
const findStreakById = async (id) => {
  return Streaks.findById(id);
};

// Update and save
const updateStreakData = async (streak, data) => {
  Object.assign(streak, data);
  return await streak.save();
};

// Delete
const deleteStreakById = async (streak) => {
  return await streak.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return Streaks.findByIdAndUpdate(id, data, { new: true });
};


module.exports = {
  createStreak,
  getStreaksWithFilters,
  countStreaks,
  findStreakById,
  updateStreakData,
  deleteStreakById,
  findByIdAndUpdate,
  getStreaksCounts,
};