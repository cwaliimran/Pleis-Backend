const { User } = require("@UserModel");
const { Events } = require("@EventsModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel");
const mongoose = require("mongoose");
const { ClubMembers } = require("@ClubMembersModel");
const { UserGlobalWallet } = require("@UserGlobalWalletModel");

const { LoyaltyReferredRecords } = require("@LoyaltyReferredRecordModel");
const WebhookTransactionsEventModel = require("../../../commonModules/paymentsIntegrations/paymentsWebhook/repositories/WebhookTransactionsEvent.model");
const { generateMeta } = require("@utils/responseUtil");
const { buildUserChangeLogs } = require("./utils/buildUserChangeLogs");
const UsersStreaks = require("@UsersStreaksModel");
const { UserReservations } = require("@UserReservationsModel");
const Orders = require("@OrdersModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const TicketingsModel = require("@TicketingsModel");
const { RewardsOrders } = require("@LoyaltyRewardsOrdersModel");
const { LoyaltyChallengesOrders } = require("@LoyaltyChallengesOrdersModel");
const { UserInterests } = require("@UserInterests");

const getReferralCount = async (userId, companyOrganizerId) => {
  try {
    // Aggregate to count the number of referrals for the user and companyOrganizer
    const result = await LoyaltyReferredRecords.aggregate([
      {
        $match: {
          referrer: new mongoose.Types.ObjectId(userId),
          companyOrganizer: new mongoose.Types.ObjectId(companyOrganizerId),
        },
      },
      {
        $group: {
          _id: null,  // We are interested in the total count, so group by null
          referralCount: { $sum: 1 },  // Count the number of referral records
        },
      },
    ]);

    if (result.length > 0) {
      return result[0].referralCount;  // Return the count of referrals
    } else {
      return 0;  // If no referrals found, return 0
    }
  } catch (error) {
    console.error('Error fetching referral count:', error);
    throw new Error('Failed to fetch referral count');
  }
};

const getTotalSpendingsAndTransactionCount = async (userId, companyOrganizerId) => {
  try {
    // Aggregate to calculate total spendings and transaction count
    const result = await WebhookTransactionsEventModel.aggregate([
      // Match the records for the provided user and company organizer
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          companyOrganizer: new mongoose.Types.ObjectId(companyOrganizerId),
          paymentStatus: "paid",  // Only consider "paid" transactions
        }
      },

      // Group to calculate total amount and transaction count
      {
        $group: {
          _id: null,
          totalSpendings: { $sum: { $toDouble: "$amount" } },  // Sum up the "amount" field
          transactionCount: { $sum: 1 },  // Count the number of transactions
        }
      },

      // Project the result to include totalSpendings and transactionCount
      {
        $project: {
          _id: 0,
          totalSpendings: 1,
          transactionCount: 1,
        }
      },
    ]);

    if (result.length > 0) {
      return result[0]; // Return the stats for the user and company organizer
    } else {
      return { totalSpendings: 0, transactionCount: 0 };
    }
  } catch (error) {
    console.error('Error calculating total spendings and transaction count:', error);
    throw new Error('Error calculating spendings and transaction count');
  }
};

const getUserCompanyLoyaltyStats = async (userId, companyOrganizerId) => {
  try {
    // Aggregate to calculate the total points earned, total points redeemed, and average per month
    const result = await UnifiedWalletTransactions.aggregate([
      // Filter by user, companyOrganizer, and walletType
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          companyOrganizer: new mongoose.Types.ObjectId(companyOrganizerId),
          walletType: "companyLoyalty"
        }
      },
      // Group by year and month to get the monthly breakdown
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          totalEarned: { $sum: { $cond: [{ $eq: ["$type", "earn"] }, "$closingBalance", 0] } },
          totalRedeemed: { $sum: { $cond: [{ $eq: ["$type", "redeem"] }, "$closingBalance", 0] } },
        }
      },

      // Sort by year and month to calculate the average per month
      { $sort: { "_id.year": 1, "_id.month": 1 } },

      // Calculate total earned, total redeemed, and average points per month
      {
        $group: {
          _id: null,
          totalEarned: { $sum: "$totalEarned" },
          totalRedeemed: { $sum: "$totalRedeemed" },
          monthsCount: { $sum: 1 },
        }
      },

      // Calculate average points per month
      {
        $project: {
          totalEarned: 1,
          totalRedeemed: 1,
          averagePerMonth: { $divide: ["$totalEarned", "$monthsCount"] }
        }
      },
    ]);

    if (result.length > 0) {
      return result[0]; // Return stats for the user
    } else {
      return { totalEarned: 0, totalRedeemed: 0, averagePerMonth: 0 };
    }
  } catch (error) {
    console.error('Error calculating user company loyalty stats:', error);
    throw new Error('Error calculating stats');
  }
};


const getUserStreak = async (userId, companyOrganizerId) => {
  try {
    const streakData = await UsersStreaks.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          companyOrganizer: new mongoose.Types.ObjectId(companyOrganizerId),
        },
      },
      {
        $project: {
          streak: 1,  // Include streak information
        },
      },
    ]);
    if (!streakData || streakData.length === 0) {
      return {
        streak: 0,  // Default streak value if no data is found
      };
    }

    // Return streak data
    return { streak: 0 };  // Default streak value if no data is found
  } catch (error) {
    console.error("Error fetching user streak:", error);
    throw new Error("Failed to fetch user streak data");
  }
};

const getUserNextLevelDetails = async (user) => {
  try {
    const GlobalData = await UserGlobalWallet.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(user),
        }
      },
      {
        $lookup: {
          from: "globalstatuslevels",  // Join with the "globalstatuslevels" collection
          localField: "global.level",  // Match the user's level with the GlobalStatusLevels
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                title: 1,
                entryPoints: 1,
              }
            },
          ],
          as: "currentLevel"  // This will create an array called "currentLevel"
        }
      },
      { $unwind: "$currentLevel" },  // Unwind to get individual level details

      // Lookup to find the next level with entryPoints greater than the user's current points
      {
        $lookup: {
          from: "globalstatuslevels",  // Join again with the "globalstatuslevels" collection
          let: { userPoints: "$global.points" },  // Pass user's points as variable to the next stage
          pipeline: [
            {
              $match: {
                $expr: {
                  $gt: ["$entryPoints", "$$userPoints"]  // Match levels with entryPoints greater than user points
                },
              },
            },
            {
              $sort: { entryPoints: 1 },  // Sort by entryPoints to get the closest next level
            },
            { $limit: 1 },  // Limit to only the next closest level
          ],
          as: "nextLevel"  // This will create an array called "nextLevel"
        }
      },
      { $unwind: "$nextLevel" },  // Unwind to get the individual next level details

      // Project the necessary fields to return in the output
      {
        $project: {
          points: "$global.points",  // User's points
          currentLevel: "$currentLevel.title",  // Current level title
          nextLevel: "$nextLevel.title",  // Next level title
          nextLevelEntryPoints: "$nextLevel.entryPoints",  // Entry points for the next level
        }
      }
    ]);

    if (!GlobalData || GlobalData.length === 0) {
      return {}
    }

    const currentLevel = GlobalData[0].currentLevel;
    const userPoints = GlobalData[0].points;
    const nextLevelEntryPoints = GlobalData[0].nextLevelEntryPoints;

    // Calculate the remaining percentage to reach the next level
    const percentageRemaining = ((nextLevelEntryPoints - userPoints) / nextLevelEntryPoints) * 100;

    return {
      currentLevel,
      nextLevel: GlobalData[0].nextLevel,
      nextLevelEntryPoints,
      percentageRemaining: Math.max(0, Math.round(percentageRemaining)), // Ensure it doesn't go below 0
    };

  } catch (error) {
    console.error("Error fetching user next level:", error);
    throw new Error("Failed to fetch user next level details");
  }
};
const getClubMembers = async (companyOrganizer, user) => {
  try {
    const clubmembersData = await ClubMembers.aggregate([
      {
        $match: {
          companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
          user: new mongoose.Types.ObjectId(user),
        }
      },

      // Lookup to fetch user details like account status and name
      {
        $lookup: {
          from: "users",  // Join with the "users" collection
          localField: "user",  // The field in ClubMembers to match with the users collection
          foreignField: "_id",  // The field in users to match the "user" field
          pipeline: [
            {
              $project: {
                firstName: 1,
                lastName: 1,
                status: "$accountState.status",
              }
            },
          ],

          as: "user"  // This will create an array called "userDetails"
        }
      },
      { $unwind: "$user" },  // Unwind to get individual user details

      // Lookup to fetch tier details
      {
        $lookup: {
          from: "tiers",  // Join with the "tiers" collection
          localField: "level",
          foreignField: "_id",  // The field in tiers to match the "level" field
          pipeline: [
            {
              $project: {
                title: 1,
              }
            },
          ],
          as: "tier"  // This will create an array called "tierDetails"
        }
      },
      { $unwind: "$tier" },  // Unwind to get individual tier details

      // Project the necessary fields to return in the output
      {
        $project: {
          tier: 1,
          points: 1,
          status: 1,
          memberShipStartDate: "$createdAt",
          user: 1,
        }
      }
    ]);
    if (!clubmembersData || clubmembersData.length === 0) {
      return [];
    }
    return clubmembersData;
  } catch (error) {
    console.error("Error fetching club members:", error);
    throw new Error("Failed to fetch club members with details");
  }
};

const getClubMembersWithDetails = async (companyOrganizer, dateFilter, timezone, user) => {
  try {


    const [clubmembersData, userNextLevelDetails, userStreak, userCompanyLoyaltyStats, userSpendingsAndTransactions, userReferralCount] = await Promise.all([
      getClubMembers(companyOrganizer, user),
      getUserNextLevelDetails(user),
      getUserStreak(user, companyOrganizer),
      getUserCompanyLoyaltyStats(user, companyOrganizer),
      getTotalSpendingsAndTransactionCount(user, companyOrganizer),
      getReferralCount(user, companyOrganizer)
    ]);

    return {
      clubmembersData: clubmembersData || [],
      userNextLevelDetails,
      userStreak,
      userCompanyLoyaltyStats,
      userSpendingsAndTransactions,
      userReferralCount
    };
  } catch (error) {
    console.error("Error fetching club members:", error);
    throw new Error("Failed to fetch club members with details");
  }
};





const getSpendingOverByTimeRaw = async (companyOrganizer, user) => {
  try {
    const matchFilter = {
      user: new mongoose.Types.ObjectId(user),
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer), // Match by company organizer ID
    };


    return await WebhookTransactionsEventModel.aggregate([
      {
        $match: matchFilter,  // Apply the match filter
      },
      {
        $project: {
          month: { $month: "$createdAt" },
          amount: { $toDouble: "$amount" },  // Ensure 'amount' is treated as a number
          // Extract the month from createdAttreated as a number
        },
      },
      {
        $group: {
          _id: "$month",  // Group by month
          totalAmount: { $sum: "$amount" },  // Sum the amount for totalAmount
        }
      },
      {
        $sort: { _id: 1 },  // Sort by month (Jan → Dec)
      },
    ]);
  } catch (error) {
    console.error('Error fetching points over time:', error);
    throw new Error('Failed to fetch points over time');
  }
};





















// ---------------- USERS ----------------

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











const getByTimeRaw = async (companyOrganizer, user) => {
  try {
    const matchFilter = {
      user: new mongoose.Types.ObjectId(user),
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer), // Match by company organizer ID
    };


    return await UnifiedWalletTransactions.aggregate([
      {
        $match: matchFilter,  // Apply the match filter
      },
      {
        $project: {
          month: { $month: "$createdAt" },  // Extract the month from createdAt
          type: 1,  // Include the 'type' field to distinguish between 'redeem' and 'earn'
          totalPoints: { $toDouble: "$points.total" },  // Ensure 'points.total' is treated as a number
        },
      },
      {
        $group: {
          _id: "$month",  // Group by month
          earn: {
            $sum: {
              $cond: [{ $eq: ["$type", "earn"] }, "$totalPoints", 0],  // Sum points where type is 'earn'
            },
          },
          redeem: {
            $sum: {
              $cond: [{ $eq: ["$type", "redeem"] }, "$totalPoints", 0],  // Sum points where type is 'redeem'
            },
          },
        },
      },
      {
        $sort: { _id: 1 },  // Sort by month (Jan → Dec)
      },
    ]);
  } catch (error) {
    console.error('Error fetching ticket orders over time:', error);
    throw new Error('Failed to fetch ticket orders over time');
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

const getTopMenuOrdersFromWallet = async ({
  user,
  companyOrganizer,
  page = 1,
  limit = 10,
}) => {
  try {
    const skip = (page - 1) * limit;

    const matchFilter = {
      user: new mongoose.Types.ObjectId(user),
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
      walletType: "companyLoyalty",
      domainType: "menuorders",
    };


    const totalRecords = await UnifiedWalletTransactions.countDocuments(matchFilter);

    const data = await UnifiedWalletTransactions.aggregate([
      {
        $match: matchFilter,
      },

      {
        $sort: { "points.total": -1 },
      },

      { $skip: skip },
      { $limit: limit },

      // 🔗 JOIN MenuOrders using entityId
      {
        $lookup: {
          from: "menuorders",
          localField: "entityId",
          foreignField: "_id",
          as: "order",
        },
      },
      {
        $unwind: {
          path: "$order",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                firstName: 1,
                lastName: 1,
              },
            },
          ],
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🔥 extract items info
      {
        $addFields: {
          items: "$order.items",
          totalPrice: "$order.totalPrice",
        },
      },

      // 🔥 unwind items to process each menu item
      {
        $unwind: {
          path: "$items",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🔥 extract menu item name + price
      {
        $project: {
          orderId: "$order._id",
          totalPrice: 1,
          createdAt: 1,
          points: "$points.total",

          itemName: "$items.menuItemSnapShot.title",
          itemTotalPrice: "$items.finalPrice",
          user: 1,
        },
      },

      // 🔥 group back per order
      {
        $group: {
          _id: "$orderId",
          totalPrice: { $first: "$totalPrice" },
          points: { $first: "$points" },
          user: { $first: "$user" },
          createdAt: { $first: "$createdAt" },

          items: {
            $push: {
              name: "$itemName",
              price: "$itemTotalPrice",
            },
          },

        },
      },

      // 🔥 final shape
      {
        $project: {
          _id: 0,
          totalPrice: 1,
          points: 1,
          createdAt: 1,
          items: 1,
          user: 1,
        },
      },
    ]);
    const meta = generateMeta(page, limit, totalRecords);
    return {
      data,
      meta,
    };
  } catch (error) {
    console.error("Error fetching top menu orders:", error);
    throw new Error("Failed to fetch menu orders from wallet");
  }
};



















const getEventIdsByOrganization = async (organizationId) => {
  try {
    // Find all events for the given organizationId and return only the event publicId (_id)
    const events = await Events.find(
      { "basicInfo.organization": new mongoose.Types.ObjectId(organizationId), status: "active" }, // Filter by organizationId and active status
      { _id: 1 } // Only include the _id field (event ID)
    );

    // Extract the event IDs from the result
    const eventIds = events.map(event => event._id);

    return eventIds;
  } catch (error) {
    console.error("Error fetching event IDs:", error);
    return [];
  }
};














const getReferralsOverTime = async (companyOrganizer, user) => {
  try {
    const year = new Date().getFullYear();
    const start = new Date(`${year}-01-01T00:00:00.000Z`);
    const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    const matchFilter = {
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
      createdAt: { $gte: start, $lt: end },
      referrer: new mongoose.Types.ObjectId(user),
    };

    return await LoyaltyReferredRecords.aggregate([
      {
        $match: matchFilter,
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
        $sort: { _id: 1 },
      },
    ]);
  } catch (error) {
    console.error("Error fetching referrals over time:", error);
    throw new Error("Failed to fetch referrals over time");
  }
};



const getOrderTypeStats = async (companyOrganizer, user) => {
  try {
    const matchFilter = {
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
      user: new mongoose.Types.ObjectId(user),
      paymentStatus: "paid",
    };

    const result = await WebhookTransactionsEventModel.aggregate([
      {
        $match: matchFilter,
      },


      {
        $group: {
          _id: "$orderType",
          count: { $sum: 1 },
        },
      },


      {
        $group: {
          _id: null,
          total: { $sum: "$count" },
          data: {
            $push: {
              name: "$_id",
              count: "$count",
            },
          },
        },
      },

      {
        $unwind: "$data",
      },
      {
        $project: {
          _id: 0,
          name: "$data.name",
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
    ]);

    return result;
  } catch (error) {
    console.error("Error fetching order type stats:", error);
    throw new Error("Failed to fetch order type stats");
  }
};






const getAllWalletTransactions = async ({ user, companyOrganizer, page = 1, limit = 10 }) => {
  try {
    const skip = (page - 1) * limit;

    const matchFilter = {
      user: new mongoose.Types.ObjectId(user),
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    };

    const totalRecords = await UnifiedWalletTransactions.countDocuments(matchFilter);

    const data = await UnifiedWalletTransactions.aggregate([
      {
        $match: matchFilter,
      },

      // 🔥 latest first
      {
        $sort: { createdAt: -1 },
      },

      { $skip: skip },
      { $limit: limit },

      // ✅ clean response
      {
        $project: {
          _id: 0,
          type: 1,
          points: "$points.total",
          createdAt: 1,
          description: {
            $ifNull: ["$description", ""],
          },
        },
      },
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    };
  } catch (error) {
    console.error("Error fetching transactions:", error);
    throw new Error("Failed to fetch transactions");
  }
};

const getWebhookTransactions = async ({
  user,
  companyOrganizer,
  page = 1,
  limit = 10,
}) => {
  try {
    const skip = (page - 1) * limit;

    const matchFilter = {
      user: new mongoose.Types.ObjectId(user),
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
      provider: "monri",
    };

    const totalRecords = await WebhookTransactionsEventModel.countDocuments(matchFilter);

    const data = await WebhookTransactionsEventModel.aggregate([
      {
        $match: matchFilter,
      },

      // 🔥 latest first
      {
        $sort: { createdAt: -1 },
      },

      { $skip: skip },
      { $limit: limit },

      {
        $project: {
          _id: 0,
          orderType: 1,
          amount: { $toDouble: "$amount" },
          createdAt: 1,
          paymentStatus: 1,

          // ✅ linked check
          linked: {
            $cond: {
              if: { $ne: ["$orderNumber", null] },
              then: "yes",
              else: "no",
            },
          },
        },
      },
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    };
  } catch (error) {
    console.error("Error fetching webhook transactions:", error);
    throw new Error("Failed to fetch webhook transactions");
  }
};

const getTopRepeatedOrdersWithDetails = async ({ user, companyOrganizer, limit = 5 }) => {
  try {
    const matchFilter = {
      user: new mongoose.Types.ObjectId(user),
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
      provider: "monri",
    };

    const data = await WebhookTransactionsEventModel.aggregate([
      { $match: matchFilter },

      // 🔥 group by orderNumber
      {
        $group: {
          _id: "$orderNumber",
          orderType: { $first: "$orderType" },
          count: { $sum: 1 },
          amount: { $first: { $toDouble: "$amount" } },
        },
      },

      { $sort: { count: -1 } },
      { $limit: limit },

      // =========================
      // 🔵 USER RESERVATIONS
      // =========================
      {
        $lookup: {
          from: "userreservations",
          localField: "_id",
          foreignField: "_id",
          as: "reservation",
        },
      },

      // =========================
      // 🟢 MENU ORDERS
      // =========================
      {
        $lookup: {
          from: "menuorders",
          localField: "_id",
          foreignField: "_id",
          as: "menuOrder",
        },
      },

      // =========================
      // 🟡 TICKETING BOOKINGS
      // =========================
      {
        $lookup: {
          from: "ticketingbookings",
          localField: "_id",
          foreignField: "_id",
          as: "booking",
        },
      },

      // =========================
      // 🎯 EXTRACT TITLE
      // =========================
      {
        $addFields: {
          title: {
            $switch: {
              branches: [
                // 🔵 userreservations
                {
                  case: { $eq: ["$orderType", "userreservations"] },
                  then: {
                    $ifNull: [
                      { $arrayElemAt: ["$reservation.reservationSnapshot.reservationType", 0] },
                      "",
                    ],
                  },
                },

                // 🟢 menuorders
                {
                  case: { $eq: ["$orderType", "menuorders"] },
                  then: {
                    $ifNull: [
                      { $arrayElemAt: ["$menuOrder.items.menuItemSnapShot.title", 0] },
                      "",
                    ],
                  },
                },

                // 🟡 ticketingbookings / transfer
                {
                  case: {
                    $in: ["$orderType", ["ticketingbookings", "tickettransfer"]],
                  },
                  then: {
                    $let: {
                      vars: {
                        ticketId: {
                          $arrayElemAt: ["$booking.ticket.ticketId", 0],
                        },
                      },
                      in: "$$ticketId", // placeholder (next lookup needed if you want title)
                    },
                  },
                },
              ],
              default: "",
            },
          },
        },
      },

      // =========================
      // FINAL SHAPE
      // =========================
      {
        $project: {
          _id: 0,
          orderNumber: "$_id",
          orderType: 1,
          count: 1,

          title: {
            $cond: {
              if: { $isArray: "$title" },
              then: { $arrayElemAt: ["$title", 0] },
              else: {
                $ifNull: ["$title", ""]
              }
            }
          },

          amount: 1,
        },
      }
    ]);

    return data;
  } catch (error) {
    console.error("Error fetching combined data:", error);
    throw new Error("Failed to fetch combined order analytics");
  }
};

const getLatestReferrals = async ({ companyOrganizer, limit = 5, user }) => {
  try {
    const matchFilter = {
      referrer: new mongoose.Types.ObjectId(user),
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    };

    const data = await LoyaltyReferredRecords.aggregate([
      {
        $match: matchFilter,
      },

      // 🔥 latest first
      {
        $sort: { createdAt: -1 },
      },

      { $limit: limit },

      // 🔗 populate referrer
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                firstName: 1,
                lastName: 1,
                email: 1,
              },
            },
          ],
          as: "user",
        },
      },

      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🔥 status logic
      {
        $addFields: {
          status: {
            $cond: {
              if: { $ne: ["$user", null] },
              then: "joined",
              else: "pending",
            },
          },
        },
      },

      // 🔥 final output
      {
        $project: {
          _id: 0,
          user: 1,

          status: 1,
          createdAt: 1,
        },
      },
    ]);
    if (data.length === 0) {
      return [
        {
          user: {
            firstName: "Sample",
            lastName: "User",
            email: "sample@example.com",
          },
          status: "pending",
          createdAt: new Date(),
        },
      ];
    }

    return data;
  } catch (error) {
    console.error("Error fetching referrals list:", error);
    throw new Error("Failed to fetch referrals list");
  }
};


const getActiveRewardsAndChallenges = async ({ user, companyOrganizer }) => {
  try {
    const userId = new mongoose.Types.ObjectId(user);
    const organizerId = new mongoose.Types.ObjectId(companyOrganizer);

    // =========================
    // 🎁 ACTIVE REWARDS
    // =========================
    const rewards = await RewardsOrders.aggregate([
      {
        $match: {
          user: userId,
          companyOrganizer: organizerId,
          status: "pending", // active rewards
        },
      },

      {
        $project: {
          _id: 0,
          type: { $literal: "reward" },
          title: {
            $ifNull: ["$snapshot.title", ""],
          },
          points: {
            $ifNull: ["$pointsUsed", 0],
          },
          createdAt: 1,
        },
      },
    ]);

    // =========================
    // 🏆 ACTIVE CHALLENGES
    // =========================
    const challenges = await LoyaltyChallengesOrders.aggregate([
      {
        $match: {
          user: userId,
          companyOrganizer: organizerId,
          status: "in-progress", // active challenges
        },
      },

      {
        $project: {
          _id: 0,
          type: { $literal: "challenge" },
          title: {
            $ifNull: ["$challengeSnapshot.title", ""],
          },
          points: {
            $ifNull: ["$progress.target", 0],
          },
          createdAt: 1,
        },
      },
    ]);

    // =========================
    // 🔥 COMBINE + SORT
    // =========================
    const data = [...rewards, ...challenges]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5); // ✅ limit to 5

    return data;
  } catch (error) {
    console.error("Error fetching rewards & challenges:", error);
    throw new Error("Failed to fetch rewards and challenges");
  }
};
const getUserVenueTypes = async ({ user, limit = 30 }) => {
  try {
    const userId = new mongoose.Types.ObjectId(user);

    const data = await UserInterests.aggregate([
      {
        $match: { user: userId },
      },

      // 🔥 unwind venueTypes array
      {
        $unwind: {
          path: "$venueTypes",
          preserveNullAndEmptyArrays: false,
        },
      },

      // 🔗 lookup VenueTypes
      {
        $lookup: {
          from: "venuetypes", // collection name
          localField: "venueTypes",
          foreignField: "_id",
          as: "venueType",
        },
      },

      {
        $unwind: {
          path: "$venueType",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🔥 get title
      {
        $project: {
          _id: 0,
          title: "$venueType.title",
        },
      },

      // 🔥 limit results
      {
        $limit: limit,
      },
    ]);

    return data;
  } catch (error) {
    console.error("Error fetching venue types:", error);
    throw new Error("Failed to fetch venue types");
  }
};
const getAnalyticsValue = async ({ user, companyOrganizer }) => {
  const [loyaltyTransections, webhookTransactions, topRepeatedOrders, latestReferrals, activeRewardsAndChallenges, userVenueTypes] = await Promise.all([
    getAllWalletTransactions({ user, companyOrganizer }),
    getWebhookTransactions({ user, companyOrganizer }),
    getTopRepeatedOrdersWithDetails({ user, companyOrganizer }),
    getLatestReferrals({ user, companyOrganizer }),
    getActiveRewardsAndChallenges({ user, companyOrganizer }),
    getUserVenueTypes({ user }),

  ]);

  return {
    loyaltyTransections: loyaltyTransections.data,
    webhookTransactions: webhookTransactions.data,
    topRepeatedOrders: topRepeatedOrders,
    latestReferrals: latestReferrals,
    activeRewardsAndChallenges: activeRewardsAndChallenges,
    userVenueTypes: userVenueTypes  

  }
};


module.exports = {
  getOrganizerPerformanceByMonth,

  getEventIdsByOrganization,
  getUserSingleMetric,
  getEventSingleMetric,
  getTicketSingleMetric,
  getByTimeRaw,
  getRawGlobalLoyaltyPointsDistributed,
  getTopMenuOrdersFromWallet,












  getClubMembersWithDetails,
  getSpendingOverByTimeRaw,
  getReferralsOverTime,
  getOrderTypeStats,
  getAnalyticsValue

};