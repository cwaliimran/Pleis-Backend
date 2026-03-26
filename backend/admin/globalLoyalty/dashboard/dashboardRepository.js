const { User } = require("@UserModel");
const { Events } = require("@EventsModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { getDateRanges } = require("./utils/dashboardDate.utils");
const { UserInterests } = require("@UserInterests");
const SearchSuggestion = require("@SearchSuggestionModel");
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel");
const mongoose = require("mongoose");
const { getEarnTransactions } = require("../../transactions/repositories/unifiedTransactionsRepository");
const MonriTransaction = require("../../../commonModules/paymentsIntegrations/monri/MonriTransaction");
const { ClubMembers } = require("@ClubMembersModel");
const Organizations = require("@OrganizationModel");
const EngagementEvents = require("@appEngagement/EngagementEvents");
const { UserGlobalWallet } = require("@UserGlobalWalletModel");
const { GlobalRewardsOrders } = require("@GlobalRewardsOrdersModel");




// ---------------- USERS ----------------
const getUserStats = async ({ dateFilter, timezone, companyOrganizer }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const getCount = async (Model, baseMatch, extra, range) => {
    const finalMatch = {
      ...baseMatch,
      ...extra,
      ...(range && { createdAt: range }),
    };

    return Model.countDocuments(finalMatch);
  };

  // =========================
  // 🚀 GLOBAL USERS (NO ORGANIZER)
  // =========================
  if (!companyOrganizer) {
    const baseMatch = {
      "accountState.status": { $ne: "deleted" },
    };
    return {

      totalUsersCurrent: await getCount(
        User,
        baseMatch,
        { "accountState.userType": "user" },
        ranges && { $gte: ranges.start, $lt: ranges.end }
      ),

      totalUsersPrevious: ranges
        ? await getCount(
          User,
          baseMatch,
          { "accountState.userType": "user" },
          { $gte: ranges.prevStart, $lt: ranges.prevEnd }
        )
        : 0,

      organizersCurrent: await getCount(
        User,
        baseMatch,
        { "accountState.userType": "organizer" },
        ranges && { $gte: ranges.start, $lt: ranges.end }
      ),

      organizersPrevious: ranges
        ? await getCount(
          User,
          baseMatch,
          { "accountState.userType": "organizer" },
          { $gte: ranges.prevStart, $lt: ranges.prevEnd }
        )
        : 0,

      activeUsersCurrent: await getCount(
        User,
        baseMatch,
        {
          "accountState.userType": "user",
          "accountState.status": "active",
        },
        ranges && { $gte: ranges.start, $lt: ranges.end }
      ),

      activeUsersPrevious: ranges
        ? await getCount(
          User,
          baseMatch,
          {
            "accountState.userType": "user",
            "accountState.status": "active",
          },
          { $gte: ranges.prevStart, $lt: ranges.prevEnd }
        )
        : 0,
      inactiveUsersCurrent: await getCount(
        User,
        baseMatch,
        {
          "accountState.userType": "user",
          "accountState.status": { $nin: ["active", "deleted"] },
        },
        ranges && { $gte: ranges.start, $lt: ranges.end }
      ),

      inactiveUsersPrevious: ranges
        ? await getCount(
          User,
          baseMatch,
          {
            "accountState.userType": "user",
            "accountState.status": { $nin: ["active", "deleted"] },
          },
          { $gte: ranges.prevStart, $lt: ranges.prevEnd }
        )
        : 0,
      newUsersCurrent: await getCount(
        User,
        baseMatch,
        {
          "accountState.userType": "user",
          "accountState.status": "pending",
        },
        ranges && { $gte: ranges.start, $lt: ranges.end }
      ),
      allActiveUsersCurrent: await getCount(
        User,
        baseMatch,
        {
          "accountState.userType": "user",
          "accountState.status": "active",
        },
      ),
      allInactiveUsersCurrent: await getCount(
        User,
        baseMatch,
        {
          "accountState.userType": "user",
          "accountState.status": { $nin: ["active", "deleted"] },
        },
      ),

      newUsersPrevious: ranges
        ? await getCount(
          User,
          baseMatch,
          {
            "accountState.userType": "user",
            "accountState.status": "pending",
          },
          { $gte: ranges.prevStart, $lt: ranges.prevEnd }
        )
        : 0,
    };
  }

};

const getUserSingleMetric = async ({ match, range }) => {
  const finalMatch = {
    ...match,
    ...(range && {
      createdAt: { $gte: range.start, $lt: range.end },
    }),
  };

  const result = await User.aggregate([
    { $match: finalMatch },
    { $count: "count" },
  ]);

  return result[0]?.count || 0;
};
// ---------------- EVENTS ----------------


const getEventSingleMetric = async ({ match, range }) => {
  const finalMatch = {
    ...match,
    ...(range && {
      createdAt: { $gte: range.start, $lt: range.end },
    }),
  };



  const result = await Events.aggregate([
    { $match: finalMatch },
    { $count: "count" },
  ]);

  return result[0]?.count || 0;
};





const getTicketSingleMetric = async ({ match, range }) => {
  const finalMatch = {
    ...match,
    ...(range && {
      createdAt: { $gte: range.start, $lt: range.end },
    }),
  };

  const result = await TicketingOrders.aggregate([
    { $match: finalMatch },
    { $count: "count" },
  ]);

  return result[0]?.count || 0;
};




const getOrganizerPerformanceByMonth = async ({
  organizerId,
  organizationId,
  timezone = "UTC",
  year = new Date().getFullYear(),
  companyOrganizer
}) => {
  const match = {
    purpose: "eventTicketPurchase",
    status: { $in: ["confirmed", "completed"] },
    createdAt: {
      $gte: new Date(`${year}-01-01T00:00:00.000Z`),
      $lte: new Date(`${year}-12-31T23:59:59.999Z`),
    },
  };

  if (organizerId) {
    match.companyOrganizer = new mongoose.Types.ObjectId(organizerId);
  }

  if (organizationId) {
    match.organization = new mongoose.Types.ObjectId(organizationId);
  }
  if (companyOrganizer) {
    match.companyOrganizer = new mongoose.Types.ObjectId(companyOrganizer);
  }

  const rows = await TicketingOrders.aggregate([
    { $match: match },

    {
      $addFields: {
        month: {
          $month: { date: "$createdAt", timezone },
        },
      },
    },

    {
      $group: {
        _id: "$month",
        ticketsSold: { $sum: "$ticketsPurchased" },
        revenue: { $sum: "$orderPricing.total" },
      },
    },
  ]);

  return rows;
};

const getUsersForDashboardAnalytics = async (year = new Date().getFullYear()) => {
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const users = await User.aggregate([
    {
      $match: {
        "accountState.status": "active",
        createdAt: { $gte: start, $lt: end }
      }
    },
    {
      $project: {
        gender: 1,
        dob: 1,
        timezone: 1,
        createdAt: 1,
      }
    }
  ]);

  return users;
};
const getNewUsersForDashboardAnalytics = async (year = new Date().getFullYear()) => {
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const users = await User.aggregate([
    {
      $match: {
        "accountState.status": "pending",
        createdAt: { $gte: start, $lt: end }
      }
    },
    {
      $project: {
        gender: 1,
        dob: 1,
        timezone: 1,
        createdAt: 1,
      }
    }
  ]);

  return users;
};




const getGlobalWalletStats = async ({ dateFilter, timezone, companyOrganizer }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const buildMatch = (extra = {}, range) => ({
    walletType: "globalWallet",
    ...(companyOrganizer && { companyOrganizer }),
    ...extra,
    ...(range && { createdAt: range }),
  });

  const getPointsSum = async (extra = {}, range) => {
    const result = await UnifiedWalletTransactions.aggregate([
      { $match: buildMatch(extra, range) },
      {
        $group: {
          _id: null,
          total: { $sum: "$points.total" },
        },
      },
    ]);

    return result[0]?.total || 0;
  };

  const getUniqueUsersCount = async (extra = {}, range) => {
    const result = await UnifiedWalletTransactions.aggregate([
      { $match: buildMatch(extra, range) },
      {
        $group: {
          _id: "$user",
        },
      },
      {
        $count: "totalUsers",
      },
    ]);

    return result[0]?.totalUsers || 0;
  };

  const currentRange = ranges && { $gte: ranges.start, $lt: ranges.end };

  const [
    totalPointsEarned,
    totalPointsRedeemed,
    totalUsers
  ] = await Promise.all([
    getPointsSum({ type: "earn" }, currentRange),
    getPointsSum({ type: "redeem" }, currentRange),
    getUniqueUsersCount({}, currentRange),
  ]);

  return {
    totalPointsEarned: Math.round(totalPointsEarned),
    totalPointsRedeemed: Math.round(totalPointsRedeemed),
    totalPointsBalance: Math.round(totalPointsEarned - totalPointsRedeemed),
    totalPointsActivity: Math.round(totalPointsEarned + totalPointsRedeemed),
    averagePointsPerUser: totalUsers
      ? Math.round(totalPointsEarned / totalUsers)
      : 0,
  };
};


const getGlobalWalletPointsOverTimeRaw = async () => {
  const year = new Date().getFullYear();
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return UnifiedWalletTransactions.aggregate([
    {
      $match: {
        walletType: "globalWallet",
        createdAt: { $gte: start, $lt: end }
      }
    },
    {
      $project: {
        month: { $month: "$createdAt" },
        points: "$points.total"
      }
    },
    {
      $group: {
        _id: "$month",
        points: { $sum: "$points" }
      }
    },
  ]);
};
const getRawGlobalLoyaltyPointsDistributed = async () => {
  return UnifiedWalletTransactions.aggregate([
    {
      $match: {
        walletType: "globalWallet"
      }
    },
    {
      $group: {
        _id: "$domainType",
        count: { $sum: 1 },
        points: { $sum: "$points.total" }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};
const getUsersPerGlobalLevel = async () => {
  return UserGlobalWallet.aggregate([
    {
      $match: {
        "global.level": { $ne: null }
      }
    },
    {
      $group: {
        _id: "$global.level",
        users: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: "globalstatuslevels",
        localField: "_id",
        foreignField: "_id",
        as: "level"
      }
    },
    {
      $unwind: {
        path: "$level",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        _id: 1,
        levelName: "$level.title",
        users: 1
      }
    },
    {
      $sort: { users: -1 }
    }
  ]);
};
const getGlobalRewardsUsageStats = async () => {
  const result = await GlobalRewardsOrders.aggregate([
    {
      $lookup: {
        from: "globalrewards",
        localField: "sourceId",
        foreignField: "_id",
        as: "reward"
      }
    },
    {
      $unwind: {
        path: "$reward",
        preserveNullAndEmptyArrays: false
      }
    },
    {
      $group: {
        _id: "$sourceId",
        rewardTitle: { $first: "$reward.title" },
        rewardDescription: { $first: "$reward.description" },
        rewardImage: { $first: "$reward.image" },
        pointsUsed: { $sum: "$pointsUsed" },
        claimLimit: { $first: "$reward.claimLimit" },
        createdAt: { $first: "$reward.createdAt" },
        status: { $first: "$reward.status" },
        users: { $addToSet: "$user" }
      }
    },
    {
      $project: {
        rewardTitle: 1,
        rewardDescription: 1,
        rewardImage: 1,
        pointsUsed: 1,
        claimLimit: 1,
        createdAt: 1,
        status: 1,
        totalUsersUsed: { $size: "$users" }
      }
    },
    {
      $facet: {
        mostPopularRewards: [
          { $match: { status: "active" } },
          { $sort: { totalUsersUsed: -1, createdAt: -1 } },
          { $limit: 4 }
        ],
        expiredRewards: [
          { $match: { status: "deleted" } },
          { $sort: { createdAt: -1 } },
          { $limit: 4 }
        ],
        limitReward: [
          { $match: { claimLimit: { $ne: null }, status: "active"  } },
          { $sort: { totalUsersUsed: -1, createdAt: -1 } },
          { $limit: 4 }
        ]
      }
    }
  ]);

  return result[0] || {
    mostPopularRewards: [],
    expiredRewards: [],
    limitReward: []
  };
};
module.exports = {
  getOrganizerPerformanceByMonth,
  getUserStats,
  getUserSingleMetric,
  getEventSingleMetric,
  getTicketSingleMetric,
  getUsersForDashboardAnalytics,
  getGlobalWalletStats,
  getGlobalWalletPointsOverTimeRaw,
  getRawGlobalLoyaltyPointsDistributed,
  getNewUsersForDashboardAnalytics,
  getUsersPerGlobalLevel,
  getGlobalRewardsUsageStats

};