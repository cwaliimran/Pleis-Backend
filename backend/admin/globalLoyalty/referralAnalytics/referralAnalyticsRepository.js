const { User } = require("@UserModel");
const { Events } = require("@EventsModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { getDateRanges } = require("./utils/referralAnalyticsDate.utils");
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
const Orders = require("@OrdersModel");
const { ReferredRecord } = require("@ReferredRecordModel");
const GlobalReferralSettings = require("@GlobalReferralSettingsModel");


const getTopReferrers = async (limit = 10) => {
  try {
    const data = await ReferredRecord.aggregate([
      {
        $match: {
          userId: { $ne: null },
          referrerUserId: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$referrerUserId",
          totalReferrals: { $sum: 1 },
          totalReferrerReward: {
            $sum: { $ifNull: ["$referrerReward", 0] },
          },
          referrerUserName: { $first: "$referrerUserName" },
        },
      },
      {
        $project: {
          _id: 0,
          referrerUserId: "$_id",
          referrerUserName: 1,
          totalReferrals: 1,
          totalReferrerReward: {
            $round: ["$totalReferrerReward", 2],
          },
        },
      },
      { $sort: { totalReferrerReward: -1 } },
      { $limit: limit },
    ]);

    // ✅ if data exists → return it
    if (data && data.length > 0) {
      return data;
    }

    // 🔥 fallback if empty
    return Array.from({ length: 2 }).map(() => ({
      referrerUserId: null,
      referrerUserName: "N/A",
      totalReferrals: 0,
      totalReferrerReward: 0,
    }));

  } catch (error) {
    console.error("Error getting top referrers:", error);

    // 🔥 fallback on error
    return Array.from({ length: limit }).map(() => ({
      referrerUserId: null,
      referrerUserName: "N/A",
      totalReferrals: 0,
      totalReferrerReward: 0,
    }));
  }
};

// ---------------- USERS ----------------
const getUserStats = async () => {
  try {
    // ===============================
    // 🔥 1. REFERRAL STATS (ALL TIME)
    // ===============================
    const referralResult = await ReferredRecord.aggregate([
      {
        $match: {
          userId: { $ne: null },
          referrerUserId: { $ne: null },
        },
      },
      {
        $group: {
          _id: null,

          totalReferralsCompleted: { $sum: 1 },

          totalPointsGiven: {
            $sum: {
              $add: [
                { $ifNull: ["$userReward", 0] },
                { $ifNull: ["$referrerReward", 0] },
              ],
            },
          },

        },
      },
    ]);

    const referralStats = {
      totalReferralsCompleted: referralResult[0]?.totalReferralsCompleted || 0,
      totalPointsGiven: referralResult[0]?.totalPointsGiven || 0,
    };
    let settings = await GlobalReferralSettings.findOne({
      status: "active",
    }).lean();

    // If no active → get any one
    if (!settings) {
      settings = await GlobalReferralSettings.findOne().lean();
    }

    const referralConfig = {
      referrerPoints: settings?.referrerPoints || 0,
      status: settings?.status || null,
    };
    return {
      ...referralStats,
      referralConfig,
    };

  } catch (error) {
    console.error("Error getting referral stats:", error);
    throw error;
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











const getReferralsOverTimeRaw = async () => {
  const year = new Date().getFullYear();
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return ReferredRecord.aggregate([
    {
      $match: {
        userId: { $ne: null },
        referrerUserId: { $ne: null },
        createdAt: { $gte: start, $lt: end },
      },
    },
    {
      $project: {
        month: { $month: "$createdAt" },
      },
    },
    {
      $group: {
        _id: "$month",
        totalReferrals: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 }, // Jan → Dec
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














const getGlobalReferralSettings = async () => {
  try {
    let settings = await GlobalReferralSettings.findOne({
      status: "active",
    }).lean();
    if (!settings) {
      settings = await GlobalReferralSettings.findOne().lean();
    }
    if (!settings) {
      return {
        userPoints: 0,
        referrerPoints: 0,
        minimumPurchases: 0,
        referralLimit: 0,
        status: null,
      };
    }
    return {
      userPoints: settings.userPoints || 0,
      referrerPoints: settings.referrerPoints || 0,
      minimumPurchases: settings.minimumPurchases || 0,
      referralLimit: settings.referralLimit || 0,
      status: settings.status || null,
    };

  } catch (error) {
    console.error("Error getting referral settings:", error);

    // 🔥 fallback on error
    return {
      publicId: null,
      userPoints: 0,
      referrerPoints: 0,
      minimumPurchases: 0,
      referralLimit: 0,
      status: null,
    };
  }
};

module.exports = {
  getOrganizerPerformanceByMonth,
  getUserStats,
  getUserSingleMetric,
  getEventSingleMetric,
  getTicketSingleMetric,
  getReferralsOverTimeRaw,
  getRawGlobalLoyaltyPointsDistributed,
  getTopReferrers,
  getGlobalReferralSettings

};