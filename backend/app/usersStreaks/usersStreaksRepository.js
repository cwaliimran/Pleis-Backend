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
const { createTransactionService } = require("../userWalletService/transactions/services/unifiedTransactionsService");

const createUsersStreak = async (data) => {
  const { user: userId, companyOrganizer, organization, timezone = "UTC" } = data;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const now = new Date();
    const todayReset = getTodayResetTime(timezone);

    // 1️⃣ Global cooldown (across all orgs)
    const lastGlobalCheckin = await UsersStreaks.findOne(
      { user: userId },
      {},
      { session, sort: { lastVisitAt: -1 } }
    );

    if (lastGlobalCheckin?.lastVisitAt) {
      const diffMinutes =
        (now - new Date(lastGlobalCheckin.lastVisitAt)) / (1000 * 60);

      if (diffMinutes < CHECKIN_COOLDOWN_MINUTES) {
        throw new Error(
          `Please wait ${Math.ceil(
            CHECKIN_COOLDOWN_MINUTES - diffMinutes
          )} minutes before checking in again.`
        );
      }
    }

    // 2️⃣ Daily total check-in count
    const totalCheckinsToday = await UsersStreaks.countDocuments(
      {
        user: userId,
        lastVisitAt: { $gte: todayReset },
      },
      { session }
    );

    if (totalCheckinsToday >= MAX_CHECKINS_PER_DAY) {
      throw new Error("Daily check-in limit reached (5 per day).");
    }

    // 3️⃣ Unique organizations per day
    const uniqueOrgsToday = await UsersStreaks.distinct(
      "organization",
      {
        user: userId,
        lastVisitAt: { $gte: todayReset },
      },
      { session }
    );

    const alreadyCheckedToday = uniqueOrgsToday.some(
      (org) => org.toString() === organization.toString()
    );

    if (
      !alreadyCheckedToday &&
      uniqueOrgsToday.length >= MAX_ORGANIZATIONS_PER_DAY
    ) {
      throw new Error(
        "You can check in at a maximum of 5 organizations per day."
      );
    }

    // 4️⃣ Get or create streak document (per org)
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
        },
      },
      { new: true, upsert: true, session }
    );

    // 5️⃣ Handle streak reset (ONLY streak, NOT visits)
    if (userStreak.lastVisitAt) {
      const lastReset = getTodayResetTime(timezone);

      const previousReset = new Date(lastReset);
      previousReset.setDate(previousReset.getDate() - 1);

      // If last visit was before yesterday’s reset → streak breaks
      if (userStreak.lastVisitAt < previousReset) {
        userStreak.streak = 0;
      }
    }

    // 6️⃣ Lifetime visit increment
    userStreak.visits += 1;

    // 7️⃣ Daily streak increment
    userStreak.streak += 1;
    userStreak.longestStreak = Math.max(
      userStreak.longestStreak,
      userStreak.streak
    );

    let pointsToAward = 0;

    // 8️⃣ Award points only once per org per day
    if (!alreadyCheckedToday) {
      const rules = await Streaks.find(
        {
          companyOrganizer,
          status: "active",
        },
        {},
        { session }
      );

      const rule = rules.find((r) => r.visits === userStreak.visits);

      if (rule) {
        pointsToAward = rule.points;

        const trx = await createTransactionService(
          {
            user: userId,
            companyOrganizer,
            companyPoints: {
              base: pointsToAward,
              multiplier: 1,
              total: pointsToAward,
              pointsPerEuro: 1,
            },
            allowNegative: false,
            type: "earn",
            description: "Points awarded for visit streak",
            entityId: userStreak._id,
            domainType: "userstreaks",
          },
          session
        );

        if (!trx.success) {
          throw new Error(trx.message || "Transaction failed");
        }

        userStreak.points += pointsToAward;
      }
    }

    // 9️⃣ Update last visit timestamp
    userStreak.lastVisitAt = now;

    await userStreak.save({ session });

    await session.commitTransaction();
    session.endSession();

    // 🔟 Trigger async challenge (outside transaction)
    resolveChallengeByTaskTypeService({
      userId,
      companyOrganizer,
      taskType: "visit",
      value: 1,
    });

    return {
      organization,
      visits: userStreak.visits,
      streak: userStreak.streak,
      longestStreak: userStreak.longestStreak,
      pointsEarned: pointsToAward,
      totalPoints: userStreak.points,
    };
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

const checkoutUsersStreak = async (data) => {
  const { user: userId, companyOrganizer, organization } = data;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userStreak = await UsersStreaks.findOne(
      { user: userId, companyOrganizer, organization },
      {},
      { session }
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

module.exports = {
  createUsersStreak,
  getUsersStreaksWithFilters,
  countUsersStreaks,
  findUsersStreakById,
  updateUsersStreakData,
  deleteUsersStreakById,
  findByIdAndUpdate,
  getUsersStreaksCounts,
  checkoutUsersStreak
};