// repositories/usersStreakRepository.js
const UsersStreaks = require("@UsersStreaksModel");
const { getModelCounts } = require("@dbUtils/queryUtil");
const Streaks = require("@StreaksModel");

// Create usersStreak and automatically assign next order
const createUsersStreak = async (data) => {
  // Fetch all streak rules for the company
  const { user: userId, companyOrganizer: companyOrganizerId } = data;
  const streakRules = await Streaks.find({
    companyOrganizer: companyOrganizerId,
    status: "active",
  }).sort({ visits: 1 }); // optional, just for clarity

  if (!streakRules.length) {
    throw new Error("No active streak rules found for this company.");
  }

  // Find or create user streak record
  let userStreak = await UsersStreaks.findOne({
    user: userId,
    companyOrganizer: companyOrganizerId,
  });

  if (!userStreak) {
    userStreak = new UsersStreaks({
      user: userId,
      companyOrganizer: companyOrganizerId,
      visits: 0,
      points: 0,
      streak: 0,
      longestStreak: 0,
    });
  }

  // Increment visits
  userStreak.visits += 1;
  userStreak.streak += 1;
  userStreak.longestStreak = Math.max(userStreak.longestStreak, userStreak.streak);
  userStreak.lastVisitAt = new Date();

  // Check if current visit matches any reward tier
  const reward = streakRules.find(rule => rule.visits === userStreak.visits);
  if (reward) {
    userStreak.points += reward.points;
  }

  await userStreak.save();

  return {
    userId,
    companyOrganizer: companyOrganizerId,
    visits: userStreak.visits,
    points: userStreak.points,
    rewardGiven: reward ? reward.points : 0,
  };
};

// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const getUsersStreaksWithFilters = async (
  filter,
  skip,
  limit,
  sort = { createdAt: -1 },
  selectFields = null
) => {
  const query = UsersStreaks.find(filter).populate('user').populate('companyOrganizer').sort(sort);

  if (selectFields) query.select(selectFields); // apply select dynamically
  if (limit > 0) query.skip(skip).limit(limit);

  return query.exec();
};

// Count by condition
const countUsersStreaks = async (query = {}) => {
  return UsersStreaks.countDocuments(query);
};

const getUsersStreaksCounts = async (query) => {
  return getModelCounts({ model: UsersStreaks, filterQuery: query });
}

// Find by ID
const findUsersStreakById = async (id) => {
  return UsersStreaks.findById(id).populate('user').populate('companyOrganizer');
};

// Update and save
const updateUsersStreakData = async (usersStreak, data) => {
  Object.assign(usersStreak, data);
  return await usersStreak.save();
};

// Delete
const deleteUsersStreakById = async (usersStreak) => {
  return await usersStreak.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return UsersStreaks.findByIdAndUpdate(id, data, { new: true }).populate('user').populate('companyOrganizer');
};

module.exports = {
  createUsersStreak,
  getUsersStreaksWithFilters,
  countUsersStreaks,
  findUsersStreakById,
  updateUsersStreakData,
  deleteUsersStreakById,
  findByIdAndUpdate,
  getUsersStreaksCounts,
};