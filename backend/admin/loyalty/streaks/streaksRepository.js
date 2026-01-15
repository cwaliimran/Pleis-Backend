// repositories/streakRepository.js
const Streaks = require("@StreaksModel");
const { getModelCounts } = require("@dbUtils/queryUtil");

// Create
// Create streak and automatically assign next order
const createStreak = async (data) => {
  try {

    const existingStreak = await Streaks.findOne({
      companyOrganizer: data.companyOrganizer,
      visits: data.visits,
    });

    if (existingStreak) {
      // If it exists, return a message indicating it's already present
      return {
        error: "Rule with this visits already exists.",
      };
    }

    // If no existing streak, create a new one
    const streak = new Streaks(data);
    await streak.save();

    return {
      streak,
    };
  } catch (error) {
    // Handle errors (e.g., validation errors, database errors)
    return {
      error: error.message,
    };
  }
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