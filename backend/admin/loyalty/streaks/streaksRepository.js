// repositories/streakRepository.js
const Streaks = require("@StreaksModel");
const { getModelCounts } = require("@dbUtils/queryUtil");

const mongoose = require("mongoose");
// Create streak and automatically assign next order
const createStreak = async (data) => {
  try {

    const existingStreak = await Streaks.findOne({
      companyOrganizer: data.companyOrganizer,
      visits: data.visits,
      status: "active",
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

// Get all with filters, sorted by 'visits' ascending and then 'createdAt' descending
const getStreaksWithFilters = async (
  query = {},
  
) => {
  return Streaks.findOne({ companyOrganizer: query.companyOrganizer, status: "active" }).exec();
};
const getActiveStreaksByOrganizer = async (companyOrganizer) => {
  const query = Streaks.find({
    companyOrganizer,
    status: "active"
  });
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
const findStreakByCompanyOrganizer = async (companyOrganizer) => {
  return Streaks.findOne({ companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer) }).exec();
};

// Update and save
const updateStreakData = async (data) => {
  const streak = await Streaks.findOne({
    companyOrganizer: new mongoose.Types.ObjectId(data.companyOrganizer),
    status: { $ne: "deleted" },
  });
  if (!streak) return null;

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
const StreakRulesByCompanyOrganizerGroupByAllPoints = async (companyOrganizer, userId) => {
  const streakRules = await Streaks.find({
    companyOrganizer,
    status: "active",
  });
  return streakRules;
};
module.exports = {
  createStreak,
  getStreaksWithFilters,
  countStreaks,
  findStreakByCompanyOrganizer,
  updateStreakData,
  deleteStreakById,
  findByIdAndUpdate,
  getStreaksCounts,
  getActiveStreaksByOrganizer,
  StreakRulesByCompanyOrganizerGroupByAllPoints


};