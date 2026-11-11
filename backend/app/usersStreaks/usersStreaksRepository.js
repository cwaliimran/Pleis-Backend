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
const { resolveChallengeByTaskTypeService } = require("../loyalty/challengesOrders/challengeOrdersService");
const { createTransactionService } = require("../userWalletService/transactions/services/unifiedTransactionsService");
const { fireAndForget } = require("../../helperUtils/responseUtil");
const { getActiveEventsForOrg } = require("../../admin/events/eventRepository");
const { resolveGlobalChallengeByTaskTypeService } = require("../globalLoyalty/challengesOrders/challengesOrdersService");

const { computeStreakUpdate } = require("./streakCalculations");

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
  let savedStreak = null;
  let visitCounted = false;
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
      savedStreak = new UsersStreaks({ ...data, ...result });
      await savedStreak.save({ session });
      visitCounted = true;
    } else if (!result.unchanged) {
      Object.assign(existingStreak, result);
      savedStreak = await existingStreak.save({ session });
      visitCounted = true;
    } else {
      existingStreak.lastVisitAt = new Date();
      savedStreak = await existingStreak.save({ session }); // just bump timestamp
    }
    await session.commitTransaction();
    session.endSession();

    // Progress visit challenges only when a real visit was counted
    if (visitCounted) {
      fireAndForget(
        resolveChallengeByTaskTypeService({
          userId: data.user,
          companyOrganizer: data.companyOrganizer,
          taskType: "visit",
          value: 1,
        }),
        "VISIT_CHALLENGE"
      );

      //resolve global visit challenge
      fireAndForget(
        resolveGlobalChallengeByTaskTypeService({
          userId: data.user,
          taskType: "globalVisit",
          value: 1,
        }),
      );
    }

    return savedStreak;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const getUsersStreaksWithFilters = async (filter, skip, limit, sort = { createdAt: -1 }, selectFields = null) => {
  const query = UsersStreaks.find(filter).populate("user").populate("companyOrganizer").sort(sort);

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
  return UsersStreaks.findById(id).populate("user").populate("companyOrganizer");
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
  return UsersStreaks.findByIdAndUpdate(id, data, { new: true }).populate("user").populate("companyOrganizer");
};

const checkoutUsersStreak = async (data) => {
  const { user: userId, companyOrganizer, organization } = data;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userStreak = await UsersStreaks.findOne({ user: userId, companyOrganizer, organization }, {}, { session });

    if (!userStreak) {
      return {
        message: "Checkout successful.",
        organization,
      };
      // throw new Error("No active check-in found for this organization.");
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
  return UsersStreaks.findOne({ user: userId, organization }).sort({ streak: -1 }).limit(1);
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
