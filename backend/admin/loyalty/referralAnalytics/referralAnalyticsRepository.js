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
const LoyaltyReferralSettings = require("@LoyaltyReferralSettingsModel");
const { LoyaltyReferredRecords } = require("@LoyaltyReferredRecordModel");


const getTopReferrers = async (limit = 10, companyOrganizer) => {
  try {
    const safeLimit = Number(limit) || 10; // 🔥 FIX limit issue

    const data = await LoyaltyReferredRecords.aggregate([
      {
        $match: {
          user: { $ne: null },          
          referrer: { $ne: null },     
          companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
        },
      },
      {
        $group: {
          _id: "$referrer",

          totalReferrals: { $sum: 1 },

          totalReferrerReward: {
            $sum: { $ifNull: ["$referrerReward", 0] },
          },
        },
      },

      // 🔥 OPTIONAL: get name from Users (recommended)
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "referrerUser",
        },
      },
      {
        $unwind: {
          path: "$referrerUser",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $project: {
          _id: 0,
          referrerUserId: "$_id",

          referrerUserName: {
            $concat: [
              { $ifNull: ["$referrerUser.firstName", ""] },
              " ",
              { $ifNull: ["$referrerUser.lastName", ""] },
            ],
          },

          totalReferrals: 1,

          totalReferrerReward: {
            $round: ["$totalReferrerReward", 2],
          },
        },
      },

      { $sort: { totalReferrerReward: -1 } },

      { $limit: safeLimit }, // ✅ FIXED
    ]);

  

    // ✅ return if exists
    if (data && data.length > 0) {
      return data;
    }

    // 🔥 fallback
    return Array.from({ length: safeLimit }).map(() => ({
      referrerUserId: null,
      referrerUserName: "N/A",
      totalReferrals: 0,
      totalReferrerReward: 0,
    }));

  } catch (error) {
    console.error("Error getting top referrers:", error);

    return Array.from({ length: Number(limit) || 10 }).map(() => ({
      referrerUserId: null,
      referrerUserName: "N/A",
      totalReferrals: 0,
      totalReferrerReward: 0,
    }));
  }
};
// ---------------- USERS ----------------
const getUserStats = async ({ companyOrganizer }) => {
  try {

    const referralResult = await LoyaltyReferredRecords.aggregate([
      {
        $match: {
          user: { $ne: null },
          referrer: { $ne: null },
          companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
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
    let settings = await LoyaltyReferralSettings.findOne({
      status: "active",
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    }).lean();


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











const getReferralsOverTimeRaw = async (companyOrganizer) => {
  const year = new Date().getFullYear();
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return LoyaltyReferredRecords.aggregate([
    {
      $match: {
        userId: { $ne: null },
        referrerUserId: { $ne: null },
        createdAt: { $gte: start, $lt: end },
        companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
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














const getGlobalReferralSettings = async (companyOrganizer) => {
  try {
    let settings = await LoyaltyReferralSettings.findOne({
      status: "active",
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    }).lean();

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