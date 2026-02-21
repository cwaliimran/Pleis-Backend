// repositories/usersStreakRepository.js
const UsersStreaks = require("@UsersStreaksModel");
const { getModelCounts } = require("@dbUtils/queryUtil");
const Streaks = require("@StreaksModel");

// Create usersStreak and automatically assign next order
const { getTodayResetTime, MAX_ORGANIZATIONS_PER_DAY,
  MAX_CHECKINS_PER_DAY,
  CHECKIN_COOLDOWN_MINUTES, } = require("./configs/streakSettings");
const { default: mongoose } = require("mongoose");
const { resolveChallengeByTaskTypeService } = require("../loyalty/challengesOrders/challengeOrdersService");

const createUsersStreak = async (data) => {
  const { user: userId, companyOrganizer, organization, timezone = "UTC" } = data;

  const todayReset = getTodayResetTime(timezone);

  let companyOrganizerObjectId = new mongoose.Types.ObjectId(companyOrganizer);
  // 1) Fetch all streak rules
  const streaks = await Streaks.find({
    companyOrganizer: companyOrganizerObjectId,
    status: "active",
  });

  if (!streaks.length) {
    return {
      organization,
      visits: 0,
      streak: 0,
      longestStreak: 0,
      pointsEarned: 0,
      totalPoints: 0,
      success: true,
      message: "No active streak rules found."
    };
  }

  // 2) Get or create user daily streak record
  const userStreak = await UsersStreaks.findOneAndUpdate(
    { user: userId, companyOrganizer, organization },
    {
      $setOnInsert: {
        user: userId,
        companyOrganizer,
        organization,
        visits: 0,
        streak: 0,
        longestStreak: 0,
        points: 0,
      }
    },
    { new: true, upsert: true }
  );


  // 3) DAILY RESET CHECK (5AM LOGIC)
  if (!userStreak.lastVisitAt || new Date(userStreak.lastVisitAt) < todayReset) {
    userStreak.visits = 0;
    userStreak.streak = 0;
  }

  // 4) Limit: 5 check-ins per day
  const todayCheckinCount = await UsersStreaks.countDocuments({
    user: userId,
    lastVisitAt: { $gte: todayReset }
  });
  if (todayCheckinCount >= MAX_CHECKINS_PER_DAY) {
    throw new Error("Daily check-in limit reached (5 per day).");
  }

  // 5) Cooldown: 30-minute rule
  if (userStreak.lastVisitAt) {
    const diffMinutes = (Date.now() - new Date(userStreak.lastVisitAt).getTime()) / (1000 * 60);
    if (diffMinutes < CHECKIN_COOLDOWN_MINUTES) {
      throw new Error(`Please wait ${Math.ceil(CHECKIN_COOLDOWN_MINUTES - diffMinutes)} minutes before checking in again.`);
    }
  }

  // 6) Limit: Only 5 unique organizations per day
  const uniqueOrgsToday = await UsersStreaks.distinct("organization", {
    user: userId,
    lastVisitAt: { $gte: todayReset }
  });

  const alreadyChecked = uniqueOrgsToday.includes(organization.toString());
  if (!alreadyChecked && uniqueOrgsToday.length >= MAX_ORGANIZATIONS_PER_DAY) {
    throw new Error("You can check in at a maximum of 5 organizations per day.");
  }

  // 7) Award points only once per organization per day
  let pointsToAward = 0;

  if (!alreadyChecked) {
    const rule = streaks.find(r => r.visits === userStreak.visits + 1);
    if (rule) pointsToAward = rule.points;
  }


  // 8) Update streak
  userStreak.visits += 1;
  userStreak.streak += 1;
  userStreak.longestStreak = Math.max(userStreak.longestStreak, userStreak.streak);
  userStreak.points += pointsToAward;
  userStreak.lastVisitAt = new Date();

  await userStreak.save();

  await resolveChallengeByTaskTypeService({
    userId,
    companyOrganizer,
    taskType: "visit",
    value: 1
  });


  return {
    organization,
    visits: userStreak.visits,
    streak: userStreak.streak,
    longestStreak: userStreak.longestStreak,
    pointsEarned: pointsToAward,
    totalPoints: userStreak.points,
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