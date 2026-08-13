// repositories/usersStreakRepository.js
const UsersStreaks = require("@UsersStreaksModel");
const { getModelCounts } = require("@dbUtils/queryUtil");
const Streaks = require("@StreaksModel");
const { EventCheckins } = require("@EventCheckinsModel");

// Create usersStreak and automatically assign next order
const {
  getTodayResetTime,
  MAX_ORGANIZATIONS_PER_DAY,
  MAX_CHECKINS_PER_DAY,
  CHECKIN_COOLDOWN_MINUTES,
} = require("./configs/streakSettings");
const { default: mongoose } = require("mongoose");
const {
  resolveChallengeByTaskTypeService,
} = require("../loyalty/challengesOrders/challengeOrdersService");
const {
  createTransactionService,
} = require("../userWalletService/transactions/services/unifiedTransactionsService");
const { fireAndForget } = require("../../helperUtils/responseUtil");
const { getActiveEventsForOrg } = require("../../admin/events/eventRepository");

/**
 * Returns the start of the "period" a date falls into, based on countBase.
 * Used to compare whether two dates are in the same / consecutive / skipped period.
 */
function getPeriodStart(date, countBase) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  if (countBase === "day") {
    return d;
  }

  if (countBase === "week") {
    const day = d.getDay(); // 0 = Sun
    const diffToMonday = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diffToMonday);
    return d;
  }

  if (countBase === "month") {
    d.setDate(1);
    return d;
  }
}

/**
 * Number of periods between the last visit and now.
 * 0 = same period (already checked in)
 * 1 = consecutive period (streak continues)
 * >1 = at least one period skipped (streak breaks)
 */
function getPeriodGap(lastVisitAt, now, countBase) {
  const prev = new Date(lastVisitAt);
  const curr = new Date(now);

  const diffMs = curr.getTime() - prev.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;


  if (diffMs < 0) {
    return 0;
  }

  const ONE_DAY = 24 * 60 * 60 * 1000;

  // DAY
  // 0 = less than 1 day
  // 1 = 1 day to 2 days (24 hours grace)
  // 2 = more than 2 days
  if (countBase === "day") {
    if (diffMs < ONE_DAY) {
      return 0;
    }

    if (diffMs <= ONE_DAY * 2) {
      return 1;
    }

    return 2;
  }

  // WEEK
  // 0 = less than 7 days
  // 1 = 7 days to 8 days (24 hours grace)
  // 2 = more than 8 days
  if (countBase === "week") {
    const WEEK = 7 * ONE_DAY;

    if (diffMs < WEEK) {
      return 0;
    }

    if (diffMs <= WEEK + ONE_DAY) {
      return 1;
    }

    return 2;
  }

  // MONTH
  // 0 = within the month
  // 1 = month length + 24 hours grace
  // 2 = beyond the grace period
  if (countBase === "month") {
    const daysInLastMonth = new Date(
      prev.getFullYear(),
      prev.getMonth() + 1,
      0,
    ).getDate();

    const MONTH = daysInLastMonth * ONE_DAY;

    if (diffMs < MONTH) {
      return 0;
    }

    if (diffMs <= MONTH + ONE_DAY) {
      return 1;
    }

    return 2;
  }

  return 0;
}

/**
 * Highest badge earned for a given streak count.
 * Assumes badges are defined as { title, visits } thresholds.
 */
function getBadgeForStreak(badges = [], streakCount) {
  let earned = "";
  const sorted = [...badges].sort((a, b) => a.visits - b.visits);

  for (const badge of sorted) {
    if (streakCount >= badge.visits) earned = badge.title;
  }

  return earned;
}

/**
 * Core logic: given the active streak rule and the user's existing streak doc,
 * returns what the updated streak values should be. Does NOT save anything —
 * pure calculation, easy to test.
 */
function computeStreakUpdate(streakRule, existingStreak, now = new Date()) {
  const { countBase, badges = [] } = streakRule;

  // First-ever check-in for this user/org
  if (!existingStreak) {
    const badge = getBadgeForStreak(badges, 1);
    return {
      isNew: true,
      visits: 1,
      streak: 1,
      longestStreak: 1,
      badge,
      lastVisitAt: now,
      lastBadgeAwardedAt: badge ? now : null,
    };
  }

  const gap = getPeriodGap(existingStreak.lastVisitAt, now, countBase);


  let { visits, streak, longestStreak } = existingStreak;

  if (gap === 0) {
    // Already checked in during this period — no double counting
    return {
      isNew: false,
      visits,
      streak,
      longestStreak,
      badge: existingStreak.badge,
      lastVisitAt: now, // still bump last seen
      lastBadgeAwardedAt: existingStreak.lastBadgeAwardedAt,
      unchanged: true,
    };
  }

  if (gap === 1) {
    // consecutive period, streak continues
    visits += 1;
    streak += 1;
  } else {
    // gap > 1, streak broken, restart
    visits = 1;
    streak = 1;
  }

  longestStreak = Math.max(longestStreak, streak);

  const badge = getBadgeForStreak(badges, streak) || existingStreak.badge;
  const badgeChanged = badge && badge !== existingStreak.badge;

  return {
    isNew: false,
    visits,
    streak,
    longestStreak,
    badge,
    lastVisitAt: now,
    lastBadgeAwardedAt: badgeChanged ? now : existingStreak.lastBadgeAwardedAt,
  };
}

module.exports = {
  getPeriodStart,
  getPeriodGap,
  getBadgeForStreak,
  computeStreakUpdate,
};

const createUsersStreak = async (data) => {
  const streakRule = await Streaks.findOne({
    companyOrganizer: data.companyOrganizer,
    status: "active",
  });
  if (!streakRule) {
    return;
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const existingStreak = await UsersStreaks.findOne(
      {
        user: data.user,
        companyOrganizer: data.companyOrganizer,
        organization: data.organization,
      },
      {},
      { session },
    );
    const result = computeStreakUpdate(streakRule, existingStreak, new Date());


    if (result.isNew) {
      const created = new UsersStreaks({ ...data, ...result });
      await created.save({ session });
    } else if (!result.unchanged) {
      Object.assign(existingStreak, result);
      await existingStreak.save({ session });
    } else {
      existingStreak.lastVisitAt = new Date();
      await existingStreak.save({ session }); // just bump timestamp
    }
    await session.commitTransaction();
    session.endSession();
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const getUsersStreaksWithFilters = async (
  filter,
  skip,
  limit,
  sort = { createdAt: -1 },
  selectFields = null,
) => {
  const query = UsersStreaks.find(filter)
    .populate("user")
    .populate("companyOrganizer")
    .sort(sort);

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
};

// Find by ID
const findUsersStreakById = async (id) => {
  return UsersStreaks.findById(id)
    .populate("user")
    .populate("companyOrganizer");
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
  return UsersStreaks.findByIdAndUpdate(id, data, { new: true })
    .populate("user")
    .populate("companyOrganizer");
};

const checkoutUsersStreak = async (data) => {
  const { user: userId, companyOrganizer, organization } = data;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userStreak = await UsersStreaks.findOne(
      { user: userId, companyOrganizer, organization },
      {},
      { session },
    );

    if (!userStreak) {
      throw new Error("No active check-in found for this organization.");
    }

    // ✅ Remove cooldown trigger
    userStreak.lastVisitAt = null;

    await userStreak.save({ session });

    await session.commitTransaction();
    session.endSession();

    return {
      message: "Checkout successful.",
      organization,
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

//get user streaks by organization
const getUserOrganizationStreak = async (userId, organization) => {
  return UsersStreaks.findOne({ user: userId, organization })
    .sort({ streak: -1 })
    .limit(1);
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
  checkoutUsersStreak,
  getUserOrganizationStreak,
};
