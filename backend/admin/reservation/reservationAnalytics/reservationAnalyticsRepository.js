const { User } = require("@UserModel");
const { Events } = require("@EventsModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { getDateRanges } = require("./utils/reservationAnalyticsDate.utils");
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
const Reservations = require("@ReservationsModel");
const { UserReservations } = require("@UserReservationsModel");
const WebhookTransactionsEventModel = require("../../../commonModules/paymentsIntegrations/paymentsWebhook/repositories/WebhookTransactionsEvent.model");
const { generateMeta } = require("@utils/responseUtil");
const { buildUserReservationPaymentsQA } = require("./utils/buildUserReservationPaymentsQA");
const { buildUserChangeLogs } = require("./utils/buildUserChangeLogs");




// ---------------- USERS ----------------
const getReservationsStats = async ({ companyOrganizer, organizations }) => {
  try {
    const organizerMatch = companyOrganizer
      ? { companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer) }
      : {};

    if (organizations && organizations.length > 0) {
      organizerMatch.organizationId = { $in: organizations.map(id => new mongoose.Types.ObjectId(id)) };
    }

    // =========================
    // 1. RESERVATIONS (CONFIG)
    // =========================
    const reservationsAgg = await Reservations.aggregate([
      { $match: organizerMatch },
      {
        $group: {
          _id: null,

          totalReservations: {
            $sum: {
              $cond: [
                { $eq: ["$status", "active"] },
                { $ifNull: ["$availableReservations", 0] },
                0,
              ],
            },
          },

          expiredReservations: {
            $sum: {
              $cond: [
                { $in: ["$status", ["inactive", "deleted"]] },
                { $ifNull: ["$availableReservations", 0] },
                0,
              ],
            },
          },

          totalCapacity: {
            $sum: {
              $cond: [
                { $eq: ["$status", "active"] },
                { $ifNull: ["$maxCapacityPerReservation", 0] },
                0,
              ],
            },
          },
        },
      },
    ]);
    const reservationsStats = {
      totalReservations: reservationsAgg[0]?.totalReservations || 0,
      expiredReservations: reservationsAgg[0]?.expiredReservations || 0,
      totalCapacity: reservationsAgg[0]?.totalCapacity || 0,
    };

    // =========================
    // 2. USER RESERVATIONS
    // =========================
    const userReservationsAgg = await UserReservations.aggregate([
      { $match: organizerMatch },
      {
        $group: {
          _id: null,

          totalConfirmedReservations: {
            $sum: {
              $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0],
            },
          },

          totalRevenue: {
            $sum: { $ifNull: ["$amount", 0] },
          },

          totalPrepayReservations: {
            $sum: {
              $cond: [
                { $eq: ["$paymentDetails.paymentStatus", "paid"] },
                { $ifNull: ["$amount", 0] },
                0,
              ],
            },
          },

          totalPartySize: {
            $sum: { $ifNull: ["$partySize", 0] },
          },

          avgGroupSize: {
            $avg: { $ifNull: ["$partySize", 0] },
          },

          totalTransferredReservations: {
            $sum: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ["$transferHistory", []] } }, 0] },
                1,
                0,
              ],
            },
          },
        },
      },

      {
        $addFields: {
          averageReservationValue: {
            $cond: [
              { $gt: ["$totalConfirmedReservations", 0] },
              {
                $divide: [
                  "$totalRevenue",
                  "$totalConfirmedReservations",
                ],
              },
              0,
            ],
          },

          reservationConversionRate: {
            $cond: [
              { $gt: ["$totalConfirmedReservations", 0] }, // ✅ correct check
              {
                $multiply: [
                  {
                    $divide: [
                      "$totalTransferredReservations",
                      "$totalConfirmedReservations",
                    ],
                  },
                  100,
                ],
              },
              0,
            ],
          },
        },
      },
    ]);

    const userAgg = userReservationsAgg[0] || {};

    const userReservationsStats = {
      totalConfirmedReservations:(userAgg.totalConfirmedReservations || 0).toFixed(2),
      totalRevenue: (userAgg.totalRevenue || 0).toFixed(2),
      totalPrepayReservations: (userAgg.totalPrepayReservations || 0).toFixed(2),

      averageGroupSize:(userAgg.avgGroupSize || 0).toFixed(2),
      totalCapacityReserved: (userAgg.totalPartySize || 0).toFixed(2),

      averageReservationValue: (userAgg.averageReservationValue || 0).toFixed(2),

      reservationConversionRate: (
        userAgg.reservationConversionRate || 0
      ).toFixed(2),
    };

    // =========================
    // 🔥 DERIVED METRICS (FIXED)
    // =========================
    const pendingReservations =
      reservationsStats.totalReservations -
      userReservationsStats.totalConfirmedReservations;

    const remainingCapacity =
      reservationsStats.totalCapacity -
      userReservationsStats.totalCapacityReserved;

    // =========================
    // ✅ FINAL RESPONSE
    // =========================
    return {
      ...reservationsStats,
      ...userReservationsStats,
      pendingReservations: Math.max(pendingReservations, 0),
      remainingCapacity: Math.max(remainingCapacity, 0),
    };

  } catch (error) {
    console.error("Error getting reservation stats:", error);
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











const getReservationsOverTimeRaw = async (companyOrganizer, organizations) => {
  try {
    const year = new Date().getFullYear();
    const start = new Date(`${year}-01-01T00:00:00.000Z`);
    const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);
    return await UserReservations.aggregate([
      {
        $match: {
          ...(companyOrganizer && { companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer) }),
          ...(organizations && { organizationId: { $in: organizations } }),  // Directly using the ObjectId array
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
          _id: "$month",  // Grouping by month
          totalReservations: { $sum: 1 },  // Counting reservations per month
        },
      },
      {
        $sort: { _id: 1 },  // Sorting by month (Jan → Dec)
      },
    ]);
  } catch (error) {
    console.error('Error fetching reservations over time:', error);
    throw new Error('Failed to fetch reservations over time');
  }
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















const getRevenueOverTimeRaw = async (companyOrganizer, organizations) => {
  const year = new Date().getFullYear();
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return UserReservations.aggregate([
    {
      $match: {
        ...(companyOrganizer && {
          companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
        }),
        ...(organizations && { organizationId: { $in: organizations } }),  // Directly using the ObjectId array
        createdAt: { $gte: start, $lt: end },
      },
    },
    {
      $project: {
        month: { $month: "$createdAt" },
        amount: { $ifNull: ["$amount", 0] },
        conditionType: {
          $ifNull: ["$reservationSnapshot.conditionType", "noCondition"],
        },
      },
    },
    {
      $group: {
        _id: {
          month: "$month",
          conditionType: "$conditionType",
        },
        revenue: { $sum: "$amount" },
      },
    },
    {
      $project: {
        _id: 0,
        month: "$_id.month",
        conditionType: "$_id.conditionType",
        revenue: 1,
      },
    },
    {
      $sort: { month: 1 },
    },
  ]);
};
const getReservationTypeStatsRaw = async (companyOrganizer, organizations) => {
  const year = new Date().getFullYear();
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return UserReservations.aggregate([
    {
      $match: {
        ...(companyOrganizer && {
          companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
        }),
        ...(organizations && { organizationId: { $in: organizations } }),  // Directly using the ObjectId array
        createdAt: { $gte: start, $lt: end },
      },
    },

    // extract reservationType from snapshot
    {
      $project: {
        reservationType: {
          $ifNull: ["$reservationSnapshot.reservationType", "Unknown"],
        },
      },
    },

    // group by reservationType
    {
      $group: {
        _id: "$reservationType",
        count: { $sum: 1 },
      },
    },

    // calculate total count
    {
      $group: {
        _id: null,
        total: { $sum: "$count" },
        data: {
          $push: {
            reservationType: "$_id",
            count: "$count",
          },
        },
      },
    },

    // unwind to calculate percentage
    { $unwind: "$data" },

    {
      $project: {
        _id: 0,
        reservationType: "$data.reservationType",
        count: "$data.count",
        percent: {
          $round: [
            {
              $multiply: [
                { $divide: ["$data.count", "$total"] },
                100,
              ],
            },
            2,
          ],
        },
      },
    },

    {
      $sort: { count: -1 },
    },
  ]);
};



const getReservationsByHourRaw = async (companyOrganizer, organizations) => {
  const year = new Date().getFullYear();
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return UserReservations.aggregate([
    {
      $match: {
        ...(companyOrganizer && {
          companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
        }),
        ...(organizations && { organizationId: { $in: organizations } }),  // Directly using the ObjectId array
        createdAt: { $gte: start, $lt: end },
      },
    },

    // unwind dateTimeSlots
    {
      $unwind: {
        path: "$timingSlots.dateTimeSlots",
        preserveNullAndEmptyArrays: false,
      },
    },

    // unwind timeSlots
    {
      $unwind: {
        path: "$timingSlots.dateTimeSlots.timeSlots",
        preserveNullAndEmptyArrays: false,
      },
    },

    // extract hour from startTime (0–23)
    {
      $project: {
        hour: {
          $hour: "$timingSlots.dateTimeSlots.timeSlots.startTime",
        },
      },
    },

    // group by hour
    {
      $group: {
        _id: "$hour",
        count: { $sum: 1 },
      },
    },

    {
      $sort: { _id: 1 },
    },
  ]);
};


const getUserLevelStatsRaw = async (companyOrganizer, organizations) => {
  const result = await UserReservations.aggregate([
    {
      $match: {
        userId: { $ne: null },
        ...(companyOrganizer && {
          companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
        }),
        ...(organizations && { organizationId: { $in: organizations } }),  // Directly using the ObjectId array
      },
    },

    {
      $group: {
        _id: "$userId",
      },
    },

    {
      $lookup: {
        from: "userglobalwallets",
        localField: "_id",
        foreignField: "user",
        as: "wallet",
      },
    },
    {
      $unwind: {
        path: "$wallet",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        levelId: "$wallet.global.level",
      },
    },
    {
      $lookup: {
        from: "globalstatuslevels",
        localField: "levelId",
        foreignField: "_id",
        as: "level",
      },
    },
    {
      $unwind: {
        path: "$level",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        levelName: {
          $ifNull: ["$level.title", "Unknown"],
        },
      },
    },
    {
      $group: {
        _id: "$levelName",
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$count" },
        data: {
          $push: {
            levelName: "$_id",
            count: "$count",
          },
        },
      },
    },

    { $unwind: "$data" },

    {
      $project: {
        _id: 0,
        levelName: "$data.levelName",
        count: "$data.count",
        percent: {
          $round: [
            {
              $multiply: [
                { $divide: ["$data.count", "$total"] },
                100,
              ],
            },
            2,
          ],
        },
      },
    },

    {
      $sort: { count: -1 },
    },
  ]);

  return result;
};




const getUserReservationPaymentsQA = async ({
  companyOrganizer,
  organizations,
  page = 1,
  limit = 5,
}) => {
  const skip = (page - 1) * limit;

  const matchStage = {
    orderType: "userreservations",
    ...(companyOrganizer && {
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    }),
    ...(organizations && { organization: { $in: organizations } }),  // Directly using the ObjectId array
  };

  // 🔥 total count
  const totalFiltered = await WebhookTransactionsEventModel.countDocuments(matchStage);

  // 🔥 main aggregation
  const data = await WebhookTransactionsEventModel.aggregate([
    { $match: matchStage },

    { $sort: { createdAt: -1 } },

    { $skip: skip },
    { $limit: limit },

    // ✅ USER LOOKUP (main user)
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: true,
      },
    },

    // ✅ RESERVATION LOOKUP
    {
      $lookup: {
        from: "userreservations",
        localField: "orderNumber",
        foreignField: "_id",
        as: "reservation",
      },
    },
    {
      $unwind: {
        path: "$reservation",
        preserveNullAndEmptyArrays: true,
      },
    },

    // ✅ LOOKUP USERS INSIDE reservationChanges
    {
      $lookup: {
        from: "users",
        localField: "reservation.reservationChanges.changedBy",
        foreignField: "_id",
        as: "changeUsers",
      },
    },

    // ✅ MAP changeUsers INTO reservationChanges
    {
      $addFields: {
        "reservation.reservationChanges": {
          $map: {
            input: "$reservation.reservationChanges",
            as: "change",
            in: {
              $mergeObjects: [
                "$$change",
                {
                  changedByUser: {
                    $let: {
                      vars: {
                        matchedUser: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: "$changeUsers",
                                as: "u",
                                cond: {
                                  $eq: ["$$u._id", "$$change.changedBy"],
                                },
                              },
                            },
                            0,
                          ],
                        },
                      },
                      in: {
                        _id: "$$matchedUser._id",
                        firstName: "$$matchedUser.firstName",
                        lastName: "$$matchedUser.lastName",
                        profileIcon: "$$matchedUser.profileIcon",
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },

    // ✅ FINAL SHAPE
    {
      $project: {
        _id: 1,
        transactionId: 1,
        orderNumber: 1,
        orderType: 1,
        paymentStatus: 1,
        amount: 1,
        createdAt: 1,
        user: {
          _id: "$user._id",
          firstName: "$user.firstName",
          lastName: "$user.lastName",
          profileIcon: "$user.profileIcon",
        },
        reservation: {
          reservationType: "$reservation.reservationSnapshot.reservationType",
          status: "$reservation.status",
          reservationChanges: "$reservation.reservationChanges",
          ticketType: "$reservation.reservationSnapshot.ticketType",
          timemingSlots: "$reservation.timingSlots",
        },

      },
    },
  ]);


  const formatedData = buildUserReservationPaymentsQA(data);
  const meta = generateMeta(page, limit, totalFiltered);

  return {
    data: formatedData,
    meta,
  };
};
const getUserReservationChangeLogs = async ({
  companyOrganizer,
  page = 1,
  limit = 20,
  organizations
}) => {
  const skip = (page - 1) * limit;

  const matchStage = {
    orderType: "userreservations",
    ...(companyOrganizer && {
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    }),
    ...(organizations && { organization: { $in: organizations } }),  // Directly using the ObjectId array 
    
  };

  // 🔥 total count
  const totalFiltered = await WebhookTransactionsEventModel.countDocuments(matchStage);

  // 🔥 main aggregation
  const data = await WebhookTransactionsEventModel.aggregate([
    { $match: matchStage },

    { $sort: { createdAt: -1 } },

    { $skip: skip },
    { $limit: limit },

    // ✅ RESERVATION LOOKUP
    {
      $lookup: {
        from: "userreservations",
        localField: "orderNumber",
        foreignField: "_id",
        as: "reservation",
      },
    },
    {
      $unwind: {
        path: "$reservation",
        preserveNullAndEmptyArrays: true,
      },
    },

    // ✅ LOOKUP USER INFO FOR CHANGED BY (from reservationChanges)
    {
      $lookup: {
        from: "users",
        localField: "reservation.reservationChanges.changedBy", // Match changedBy userId
        foreignField: "_id",
        as: "changeUsers",
      },
    },

    // ✅ Merge `changedByUser` directly into `changeLogs`
    {
      $addFields: {
        "reservation.reservationChanges": {
          $map: {
            input: "$reservation.reservationChanges",
            as: "change",
            in: {
              $mergeObjects: [
                "$$change",
                {
                  changedBy: {
                    $let: {
                      vars: {
                        matchedUser: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: "$changeUsers",
                                as: "u",
                                cond: {
                                  $eq: ["$$u._id", "$$change.changedBy"],
                                },
                              },
                            },
                            0,
                          ],
                        },
                      },
                      in: {
                        firstName: "$$matchedUser.firstName",
                        lastName: "$$matchedUser.lastName",
                        profileIcon: "$$matchedUser.profileIcon",
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },

    // ✅ FINAL SHAPE (changeLogs with changedBy as an object)
    {
      $project: {
        _id: 1,

        reservation: {
          reservationId: "$reservation.bookingId", // Only reservationId
          bookingId: "$reservation.bookingId",
          changeLogs: "$reservation.reservationChanges", // Now it's directly in changeLogs
        },
      },
    },
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  const formated = await buildUserChangeLogs(data);
  return {
    data: formated,
    meta,
  };
};

module.exports = {
  getOrganizerPerformanceByMonth,
  getReservationsStats,
  getUserSingleMetric,
  getEventSingleMetric,
  getTicketSingleMetric,
  getReservationsOverTimeRaw,
  getRawGlobalLoyaltyPointsDistributed,
  getRevenueOverTimeRaw,
  getReservationTypeStatsRaw,
  getReservationsByHourRaw,
  getUserLevelStatsRaw,
  getUserReservationPaymentsQA,
  getUserReservationChangeLogs
};