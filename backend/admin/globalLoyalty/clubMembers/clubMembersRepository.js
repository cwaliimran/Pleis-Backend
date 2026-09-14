const { ClubMembers } = require("@ClubMembersModel");
const { getModelCounts } = require("../../../helperUtils/dbUtils/queryUtil");
const { default: mongoose } = require("mongoose");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const { UserGlobalWallet } = require("@UserGlobalWalletModel");
const { createTransactionService } = require("../../../app/userWalletService/transactions/services/unifiedTransactionsService");
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel");
const GlobalStatusLevels = require("@GlobalStatusLevelsModel");
const { sendUserNotifications } = require("@notificationsUtil");

// Count
const countClubMembers = async (query = {}) => {
  return ClubMembers.countDocuments(query);
};

// Find by ID with population
const findClubMemberById = async (id) => {
  return ClubMembers.findById(id)
    .populate({
      path: "user",
      select: "firstName lastName username profileIcon",
    })
    .populate({
      path: "companyOrganizer",
      select: "firstName lastName username profileIcon",
    });
};

const getMembers = async (
  page = 1,
  limit = 10,
  keyword,
  status,
  companyOrganizer,
  date,
) => {
  let companyOrganizerIds = [];

  // Pagination setup
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "userData",
        pipeline: [
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
              username: 1,
              timezone: 1,
              profileIcon: 1,
            },
          },
        ],
      },
    },
    { $unwind: { path: "$userData", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        as: "companyOrganizerData",
        pipeline: [
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
              username: 1,
              profileIcon: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: "$companyOrganizerData",
        preserveNullAndEmptyArrays: true,
      },
    },
  ];

  // Apply filters dynamically
  if (companyOrganizerIds.length > 0) {
    pipeline.push({
      $match: {
        companyOrganizer: { $in: companyOrganizerIds },
      },
    });
  }

  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: { createdAt: { $gte: start, $lt: end } },
    });
  }

  // Keyword search across user and companyOrganizer fields
  if (keyword) {
    const regex = new RegExp(keyword, "i");
    pipeline.push({
      $match: {
        $or: [
          { "userData.firstName": regex },
          { "userData.lastName": regex },
          { "userData.username": regex },
          { "companyOrganizerData.firstName": regex },
          { "companyOrganizerData.lastName": regex },
          { "companyOrganizerData.username": regex },
        ],
      },
    });
  }

  // Sort, merge, clean
  pipeline.push({ $sort: { createdAt: -1 } });
  pipeline.push(
    {
      $addFields: {
        user: "$userData",
        companyOrganizer: "$companyOrganizerData",
      },
    },
    { $project: { userData: 0, companyOrganizerData: 0 } },
  );

  // Pagination + count
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await ClubMembers.aggregate(pipeline);
  const members = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Counts for meta
  const baseFilter =
    companyOrganizerIds.length > 0
      ? { companyOrganizer: { $in: companyOrganizerIds } }
      : {};

  // const counts = await getModelCounts({
  //   model: ClubMembers,
  //   filterQuery: baseFilter,
  //   statusMap: { status: ["active", "inactive"] },
  // });

  let meta = generateMeta(page, limit, totalFiltered);
  return {
    members,
    meta,
  };
};

const getCounts = async (query) => {
  return getModelCounts({ model: ClubMembers, filterQuery: query });
};
//is club member
const isClubMember = async (userId, companyOrganizer) => {
  const member = await ClubMembers.findOne({
    user: userId,
    companyOrganizer,
    status: "active",
  });
  return !!member;
};

//get user joined clubs
const getUserJoinedClubs = async (userId) => {
  return ClubMembers.find({ user: userId, status: { $ne: "left" } }).select(
    "companyOrganizer",
  );
};

const getEarnedPointsLast12Months = async (userId, session) => {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const rows = await UnifiedWalletTransactions.aggregate(
    [
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          walletType: "globalWallet",
          type: "earn",
          createdAt: { $gte: oneYearAgo },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$points.total" },
        },
      },
    ],
    { session },
  );

  return rows.length ? rows[0].total : 0;
};

const checkGlobalLoyaltyTierPromotion = async (userId, session = null) => {
  if (!userId) throw new Error("userId required");

  const earned12Months = await getEarnedPointsLast12Months(userId, session);

  const globalStatusLevels = await GlobalStatusLevels.find({ status: "active" })
    .select("_id title entryPoints")
    .session(session)
    .lean();

  const globalTier = await UserGlobalWallet.findOne({ user: userId })
    .select("global.level")
    .populate("global.level")
    .session(session)
    .lean();

  const currentLevel = globalTier?.global?.level;
  if (!currentLevel) return { promoted: false };

  const currentEntry = currentLevel.entryPoints || 0;

  // Highest level the user now qualifies for, above their current one
  const promotionTarget = globalStatusLevels.reduce((best, level) => {
    if (level.entryPoints <= currentEntry) return best;
    if (earned12Months < level.entryPoints) return best;
    return !best || level.entryPoints > best.entryPoints ? level : best;
  }, null);
  if (!promotionTarget) return { promoted: false };

  await UserGlobalWallet.updateOne(
    { user: userId },
    {
      $set: {
        "global.level": promotionTarget._id,
        "global.lastEvaluated": new Date(),
      },
    },
    { session }
  );
   

  sendUserNotifications({
    recipientIds: [userId],
    title: `Level upgraded`,
    body: `You have been promoted to ${promotionTarget.title}.`,
    data: {
      type: NotificationTypes.LEVEL_PROMOTED,
      levelId: promotionTarget._id,
      objectType: "globalstatuslevels",
    },
    sender: null,
    objectId: promotionTarget._id,
    image: null,
  }).catch((err) => console.error("Global promotion notification failed:", err));

  return { promoted: true, newLevel: promotionTarget };
};

const giftPointsGlobalLoyalty = async (user, points,notes) => {
 
  const session = await mongoose.startSession();
  session.startTransaction();
  let committed = false;

  try {

    const giftedPoints = Number(points);
    if (!Number.isFinite(giftedPoints) || giftedPoints <= 0) {
      return {
        error: {
          message: "invalid_points",
        },
      };
    }
   

    const globalPoints = {
      base: giftedPoints,
      multiplier: 1,
      total: giftedPoints,
      bonusPoints: 0,
      pointsPerEuro: 0,
    };

    const trx = await createTransactionService(
      {
        user,
        globalPoints,
        allowNegative: false,
        type: "earn",
        domainType: "gift",
        description: notes || "Points gifted",
      },
      session,
    );

    if (!trx.success) {
      throw new Error(trx.message || "transaction_failed");
    }

    await session.commitTransaction();
    committed = true;

    try {
      await checkGlobalLoyaltyTierPromotion(user);
    } catch (err) {
      console.error("[Global LOYALTY] Tier promotion failed after gift:", err);
    }

    return {
      success: true,
      data: trx.data,
    };
  } catch (error) {
    if (!committed) {
      await session.abortTransaction();
    }
    console.error("Error gifting points:", error);
    throw new Error("Failed to gift points");
  } finally {
    if (!committed) {
      try {
        await session.abortTransaction();
      } catch (err) {
        // already aborted or committed
      }
    }
    session.endSession();
  }
};
const updateMemberTier = async (user, companyOrganizer, tier) => {
  const member = await ClubMembers.findOne({ user, companyOrganizer });
  if (!member) {
    return {
      error: {
        message: "member_not_found",
      },
    };
  }

  member.level = tier;
  await member.save();
  return {
    success: true,
    data: member,
  };
};
const updateGlobalMemberTier = async (user, status) => {
  const globalWallet = await UserGlobalWallet.findOne({ user });
  if (!globalWallet) {
    return {
      error: {
        message: "global_wallet_not_found",
      },
    };
  }

  globalWallet.global.level = status;
  await globalWallet.save();
  return {
    success: true,
    data: globalWallet,
  };
};
module.exports = {
  countClubMembers,
  findClubMemberById,
  getMembers,
  isClubMember,
  getUserJoinedClubs,
  giftPointsGlobalLoyalty,
  updateMemberTier,
  updateGlobalMemberTier
};
