const { User } = require("@UserModel");
const { Events } = require("@EventsModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { getDateRanges } = require("./utils/analyticsDate.utils");
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
const UsersStreaks = require("@UsersStreaksModel");




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











const getByTimeRaw = async (organization, dateFilter, timezone) => {
  try {
    const matchFilter = {
      organization: new mongoose.Types.ObjectId(organization), // Match by organization ID
    };


    const ranges = getDateRanges({ dateFilter, timezone });

    // If there are date ranges, apply them to the match filter
    if (ranges && ranges.start && ranges.end) {
      matchFilter.createdAt = { $gte: ranges.start, $lt: ranges.end };
    }

    return await TicketingOrders.aggregate([
      {
        $match: matchFilter,  // Apply the match filter
      },
      {
        $project: {
          month: { $month: "$createdAt" },  // Extract the month from createdAt
          amount: { $toDouble: "$orderPricing.total" },  // Ensure 'total' is treated as a number
        },
      },
      {
        $group: {
          _id: "$month",  // Group by month
          totalAmount: { $sum: "$amount" },  // Sum the 'amount' values for totalAmount
        },
      },
      {
        $sort: { _id: 1 },  // Sorting by month (Jan → Dec)
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

const getViews = async (organization, dateFilter, timezone) => {
  try {
    const matchFilter = {
      entityId: new mongoose.Types.ObjectId(organization),
    };

    const ranges = getDateRanges({ dateFilter, timezone });
    // Add date filter if ranges exist
    if (ranges && ranges.start && ranges.end) {
      matchFilter.createdAt = { $gte: ranges.start, $lt: ranges.end };
    }


    // Aggregate query with $lookup to join EngagementEvents with User collection
    const result = await EngagementEvents.aggregate([
      {
        $match: {
          ...matchFilter,
          entityType: "organizations",
          action: "view",
        },
      },
      {
        $group: {
          _id: null,
          userIds: { $addToSet: "$userId" }, // Collect unique userIds in an array
        },
      },
      {
        $lookup: {
          from: "users", // Join with the "users" collection
          localField: "userIds", // Match the user IDs from the previous group
          foreignField: "_id", // Match with the "_id" field in the "users" collection
          as: "userDetails", // Alias for the joined data
        },
      },
      {
        $unwind: {
          path: "$userDetails", // Unwind the user details array
          preserveNullAndEmptyArrays: true, // Keep documents even if userDetails is empty
        },
      },
      {
        $project: {
          _id: 0,
          userId: "$userDetails._id",
          gender: "$userDetails.gender",
          dob: "$userDetails.dob",
          timezone: "$userDetails.timezone",
          createdAt: "$userDetails.createdAt",
        },
      },
      {
        $sort: { "userDetails.createdAt": 1 }, // Sort by user creation date, if needed
      },
    ]);

    // Return the result with the user details
    return result.map(user => ({
      userId: user.userId,
      gender: user.gender,
      dob: user.dob,
      timezone: user.timezone,
      createdAt: user.createdAt,
    }));
  } catch (err) {
    console.error("Error fetching user views and analytics:", err);
    return [];
  }
};










const getRawInterestDataByOrganizer = async (users, dateFilter, timezone) => {
  const matchFilter = {
    user: { $in: users },
  };
  const ranges = getDateRanges({ dateFilter, timezone });
  // Add date filter if ranges exist
  if (ranges && ranges.start && ranges.end) {
    matchFilter.createdAt = { $gte: ranges.start, $lt: ranges.end };
  }

  return UserInterests.aggregate([
    // ✅ Filter only provided users FIRST (important for performance)
    {
      $match: matchFilter
    },

    // Join user (gender only)
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" },

    // Only active users
    {
      $match: {
        "user.accountState.status": "active"
      }
    },

    // Explode categories
    { $unwind: "$categories" },

    // Join category title
    {
      $lookup: {
        from: "categories",
        localField: "categories",
        foreignField: "_id",
        as: "category"
      }
    },
    { $unwind: "$category" },

    // Final output
    {
      $project: {
        categoryId: "$category._id",
        categoryTitle: "$category.title",
        gender: "$user.gender"
      }
    }
  ]);
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




const geViewsByTimeRaw = async (organization, dateFilter, timezone) => {
  try {
    const matchFilter = {
      entityType: "organizations",
      action: "view",
      entityId: new mongoose.Types.ObjectId(organization),
    };

    const ranges = getDateRanges({ dateFilter, timezone });

    if (ranges && ranges.start && ranges.end) {
      matchFilter.createdAt = { $gte: ranges.start, $lt: ranges.end };
    }

    return await EngagementEvents.aggregate([
      {
        $match: matchFilter,
      },
      {
        $project: {
          month: { $month: "$createdAt" }, // Extract the month from the createdAt field
        },
      },
      {
        $group: {
          _id: "$month", // Group by month
          viewCount: { $sum: 1 }, // Count the number of views (each document is a view)
        },
      },
      {
        $sort: { _id: 1 },  // Sorting by month (Jan → Dec)
      },
    ]);
  } catch (error) {
    console.error('Error fetching event views over time:', error);
    throw new Error('Failed to fetch event views over time');
  }
};







const getRawTagsDataByOrganizer = async (users, dateFilter, timezone) => {
  const matchFilter = {
    user: { $in: users },
  };
  const ranges = getDateRanges({ dateFilter, timezone });

  // If there are date ranges, apply them to the match filter
  if (ranges && ranges.start && ranges.end) {
    matchFilter.createdAt = { $gte: ranges.start, $lt: ranges.end };
  }
  return UserInterests.aggregate([
    // ✅ Filter only provided users FIRST (important for performance)
    {
      $match: matchFilter
    },

    // Join user (gender only)
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      },
    },
    { $unwind: "$user" },

    // Only active users
    {
      $match: {
        "user.accountState.status": "active"
      },
    },

    // Explode tags
    { $unwind: "$tags" },

    // Join tag title
    {
      $lookup: {
        from: "tags",
        localField: "tags",
        foreignField: "_id",
        as: "tag"
      },
    },
    { $unwind: "$tag" },

    // Group by tagId, count how many times the tag appears per gender
    {
      $group: {
        _id: "$tag._id",  // Group by tagId
        tagTitle: { $first: "$tag.title" },  // Get the tag title
        males: { $sum: { $cond: [{ $eq: ["$user.gender", "Male"] }, 1, 0] } },  // Count males
        females: { $sum: { $cond: [{ $eq: ["$user.gender", "Female"] }, 1, 0] } },  // Count females
        others: { $sum: { $cond: [{ $eq: ["$user.gender", "Other"] }, 1, 0] } },  // Count others
        totalCount: { $sum: 1 }  // Count total occurrences of this tag
      },
    },

    // Sort by the total count (descending), showing the most frequent tags first
    { $sort: { totalCount: -1 } },

    // Limit to top 10 tags
    { $limit: 10 },

    // Final output with tagId, tagTitle, males, females, others, and totalCount
    {
      $project: {
        tagId: "$_id",
        tagTitle: 1,
        males: 1,
        females: 1,
        others: 1,
        totalCount: 1,
      },
    },
  ]);
};


const getRepeatPurchasesByTimeRaw = async (organization, dateFilter, timezone) => {
  try {
    const matchFilter = {
      organization: new mongoose.Types.ObjectId(organization), // Match by organization ID
    };

    const ranges = getDateRanges({ dateFilter, timezone });

    // If there are date ranges, apply them to the match filter
    if (ranges && ranges.start && ranges.end) {
      matchFilter.createdAt = { $gte: ranges.start, $lt: ranges.end };
    }

    return await TicketingOrders.aggregate([
      {
        $match: matchFilter,  // Apply the match filter
      },
      {
        $project: {
          month: { $month: "$createdAt" },  // Extract the month from createdAt
          user: 1,  // Include user in the projection
        },
      },
      {
        $group: {
          _id: { month: "$month", user: "$user" },  // Group by month and user
          purchaseCount: { $sum: 1 },  // Count the number of purchases by each user
        },
      },
      {
        $match: {
          purchaseCount: { $gt: 1 },  // Only keep users with more than 1 purchase
        },
      },
      {
        $group: {
          _id: "$_id.month",  // Group again by month
          repeatPurchasers: { $sum: 1 },  // Count the number of users with more than 1 purchase
        },
      },
      {
        $sort: { _id: 1 },  // Sorting by month (Jan → Dec)
      },
    ]);
  } catch (error) {
    console.error('Error fetching repeat purchases over time:', error);
    throw new Error('Failed to fetch repeat purchases over time');
  }
};
const getUserStreaksByTimeRaw = async (organization, dateFilter, timezone) => {
  try {
    const matchFilter = {
      organization: new mongoose.Types.ObjectId(organization), // Match by organization ID
    };

    const ranges = getDateRanges({ dateFilter, timezone });

    // If there are date ranges, apply them to the match filter
    if (ranges && ranges.start && ranges.end) {
      matchFilter.lastVisitAt = { $gte: ranges.start, $lt: ranges.end };
    }

    return await UsersStreaks.aggregate([
      {
        $match: matchFilter,  // Apply the match filter
      },
      {
        $project: {
          month: { $month: "$lastVisitAt" },  // Extract the month from lastVisitAt
          user: 1,  // Include user in the projection
          visits: 1,  // Include visits for summing
        },
      },
      {
        $group: {
          _id: { month: "$month", user: "$user" },  // Group by month and user
          totalVisits: { $sum: "$visits" },  // Sum the 'visits' values for each user
        },
      },
      {
        $group: {
          _id: "$_id.month",  // Group again by month
          totalVisits: { $sum: "$totalVisits" },  // Sum the total visits for the month
        },
      },
      {
        $sort: { _id: 1 },  // Sorting by month (Jan → Dec)
      },
    ]);
  } catch (error) {
    console.error('Error fetching user visits over time:', error);
    throw new Error('Failed to fetch user visits over time');
  }
};
module.exports = {
  getOrganizerPerformanceByMonth,
  getViews,
  geViewsByTimeRaw,
  getRawInterestDataByOrganizer,
  getEventIdsByOrganization,
  getUserSingleMetric,
  getEventSingleMetric,
  getTicketSingleMetric,
  getRepeatPurchasesByTimeRaw,
  getByTimeRaw,
  getRawGlobalLoyaltyPointsDistributed,
  getUserReservationPaymentsQA,
  getUserReservationChangeLogs,
  getRawTagsDataByOrganizer,
  getUserStreaksByTimeRaw
};