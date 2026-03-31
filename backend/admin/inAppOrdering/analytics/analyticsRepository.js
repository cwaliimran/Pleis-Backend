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
const MenuOrders = require("../../../commonModules/menuItemsAndOrders/Orders");
const MenuItemCategories = require("@MenuItemCategoriesModel");





const orderStatsRaw = async ({ organizations, dateFilter, timezone }) => {
  const ranges = getDateRanges({ dateFilter, timezone }); // Get the date ranges for 
  const baseMatch = {
    ...(organizations && {
      organization: { $in: organizations }, // Directly use the organizations array
    }),
  };

  const RevenueCurrent = await MenuOrders.aggregate([
    {
      $match: {
        ...baseMatch,
        status: "completed", // Only completed orders
        ...(ranges && { createdAt: { $gte: ranges.start, $lt: ranges.end } }), // Filter by date range
      },
    },
    {
      $group: {
        _id: null, // No grouping, just sum everything
        totalRevenue: { $sum: "$totalPrice" }, // Sum the totalPrice
        totalRevenueCommission: { $sum: { $multiply: ["$totalPrice", 0.06] } }, // Calculate 6% commission for each order
      },
    },
  ]);
  const RevenueCommission = await MenuOrders.aggregate([
    {
      $match: {
        ...baseMatch,
        status: "completed", // Only completed orders
      },
    },
    {
      $group: {
        _id: null, // No grouping, just sum everything
        totalRevenueCommission: { $sum: { $multiply: ["$totalPrice", 0.06] } }, // Calculate 6% commission for each order
      },
    },
  ]);
  const limitedTimeItem = await MenuOrders.aggregate([
    {
      $match: {
        ...baseMatch,
        status: "completed", // Only completed orders
      },
    },
    {
      $unwind: "$items", // Unwind the items array to work with individual items
    },
    {
      $match: {
        "items.isLimitedTimeOffer": true, // Only include items marked as limited time offers
      },
    },
    {
      $group: {
        _id: null, // No grouping, just count everything
        totalLimitedTimeItems: { $sum: 1 }, // Count the number of limited time items
      },
    },
  ]);

  const totalLimitedTimeItems = limitedTimeItem[0]?.totalLimitedTimeItems || 0;

  const totalRevenueCurrent = RevenueCurrent[0]?.totalRevenue || 0; // Extract the totalRevenue
  const totalRevenueCommission = RevenueCommission[0]?.totalRevenueCommission || 0;

  const ItemsSoldCurrent = await MenuOrders.aggregate([
    {
      $match: {
        ...baseMatch,
        status: "completed", // Only count items from completed orders
      },
    },
    {
      $unwind: "$items", // Unwind the items array
    },
    {
      $group: {
        _id: null, // Group everything into one document
        totalItemsSold: { $sum: "$items.quantity" }, // Sum the quantity of all items
      },
    },
  ]);
  const ordersCurrent = await MenuOrders.aggregate([
    {
      $match: {
        ...baseMatch,
        ...(ranges && { createdAt: { $gte: ranges.start, $lt: ranges.end } }), // Filter by the given date range
      },
    },
    {
      $count: "totalOrders" // Count the number of documents
    }
  ]);
  const ordersPrevious = await MenuOrders.aggregate([
    {
      $match: {
        ...baseMatch,
        ...(ranges && { createdAt: { $gte: ranges.prevStart, $lt: ranges.prevEnd } }), // Filter by the previous date range
      },
    },
    {
      $count: "totalOrders" // Count the number of documents
    }
  ]);
  const totalOrdersCurrent = ordersCurrent[0]?.totalOrders || 0; // Extract the totalOrders value
  const totalOrdersPrevious = ordersPrevious[0]?.totalOrders || 0; // Extract the totalOrders value


  // Extract the totalItemsSold value
  const totalItemsSold = ItemsSoldCurrent[0]?.totalItemsSold || 0;

  const averageOrderValue = totalRevenueCurrent / totalItemsSold;

  const RevenuePrevious = await MenuOrders.aggregate([
    {
      $match: {
        ...baseMatch,
        status: "completed", // Only completed orders
        ...(ranges && { createdAt: { $gte: ranges.prevStart, $lt: ranges.prevEnd } }), // Filter by previous date range
      },
    },
    {
      $group: {
        _id: null, // No grouping, just sum everything
        totalRevenue: { $sum: "$totalPrice" }, // Sum the totalPrice
      },
    },
  ]);
  const totalRevenuePrevious = RevenuePrevious[0]?.totalRevenue || 0; // Extract the totalRevenue

  const orderFrequencyCurrent = await MenuOrders.aggregate([
    { $match: baseMatch },
    {
      $project: {
        orderFrequency: {
          $cond: {
            if: { $eq: [{ $hour: "$createdAt" }, 0] }, // Check if the hour is 0 (midnight)
            then: 1, // Return 1 to avoid division by zero
            else: { $divide: [1, { $hour: "$createdAt" }] }, // Otherwise, calculate the frequency
          },
        },
      },
    },
  ]);

  // =========================
  // 🚀 MOST ORDERED CATEGORY (from menuItemSnapShot)
  // =========================
  const mostOrderedCategoryData = await MenuOrders.aggregate([
    { $match: baseMatch },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "menuitems", // Lookup menu item details
        localField: "items.menuItem",
        foreignField: "_id",
        as: "menuItemDetails",
      },
    },
    { $unwind: "$menuItemDetails" },
    {
      $group: {
        _id: "$menuItemDetails.category", // Group by category
        totalItemsSoldInCategory: { $sum: "$items.quantity" }, // Count of items in each category
      },
    },
    { $sort: { totalItemsSoldInCategory: -1 } },
    { $limit: 1 },
    {
      $lookup: {
        from: "menuitemcategories", // Lookup category details
        localField: "_id",
        foreignField: "_id",
        as: "categoryDetails",
      },
    },
    { $unwind: "$categoryDetails" },
    {
      $project: {
        mostOrderedCategory: "$categoryDetails.title", // Most ordered category title
        totalItemsSoldInCategory: 1,
      },
    },
  ]);

  // Returning the results
  return {
    totalOrdersCurrent: parseInt(totalOrdersCurrent.toFixed(2)),
    totalOrdersPrevious: parseInt(totalOrdersPrevious.toFixed(2)),
    totalRevenueCurrent: parseInt(totalRevenueCurrent.toFixed(2)),
    revenueAfterCommission: parseInt((totalRevenueCurrent - totalRevenueCommission).toFixed(2)),
    totalRevenueCommission: parseInt(totalRevenueCommission.toFixed(2)),
    totalItemsSold: parseInt(totalItemsSold.toFixed(2)),
    averageOrderValue: parseInt(averageOrderValue.toFixed(2)),
    totalRevenuePrevious: parseInt(totalRevenuePrevious.toFixed(2)),
    orderFrequencyPerHour: orderFrequencyCurrent.length ? parseInt(orderFrequencyCurrent[0].orderFrequency.toFixed(2)) : 0,
    mostOrderedCategory: mostOrderedCategoryData[0]?.mostOrderedCategory || "N/A",
    totalLimitedTimeItems: parseInt(totalLimitedTimeItems.toFixed(2))
  };
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











const getReservationsOverTimeRaw = async (organizations) => {
  const year = new Date().getFullYear();
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);
  return MenuOrders.aggregate([
    {
      $match: {
        ...(organizations && {
          organization: { $in: organizations },
        }),
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
        totalReservations: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 }, // Jan → Dec
    },
  ]);
};
const getAverageOrderValueOverTimeRaw = async (organizations) => {
  const year = new Date().getFullYear();
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return MenuOrders.aggregate([
    {
      $match: {
        ...(organizations && {
          organization: { $in: organizations },
        }),
        createdAt: { $gte: start, $lt: end },
      },
    },
    {
      $project: {
        month: { $month: "$createdAt" },
        totalPrice: 1, // Include totalPrice for each order
      },
    },
    {
      $group: {
        _id: "$month",
        totalPriceSum: { $sum: "$totalPrice" }, // Sum of totalPrice for the month
        totalCount: { $sum: 1 }, // Count of orders in the month
      },
    },
    {
      $project: {
        month: "$_id",
        totalReservations: {
          $cond: [
            { $eq: ["$totalCount", 0] }, // Avoid division by zero
            0,
            { $divide: ["$totalPriceSum", "$totalCount"] }, // Calculate average order value
          ],
        },
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















const getRevenueOverTimeRaw = async (organizations) => {
  const year = new Date().getFullYear();
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return MenuOrders.aggregate([
    {
      $match: {
        ...(organizations && {
          organization: { $in: organizations },
        }),
        createdAt: { $gte: start, $lt: end },
        status: "completed", // Only completed orders
      },
    },
    {
      $project: {
        month: { $month: "$createdAt" },
        totalPrice: { $ifNull: ["$totalPrice", 0] },
      },
    },
    {
      $group: {
        _id: {
          month: "$month",
        },
        totalRevenue: { $sum: "$totalPrice" },
        netIncome: { $sum: { $multiply: ["$totalPrice", 0.06] } }, // 6% of each order's totalPrice
      },
    },
    {
      $project: {
        _id: 0,
        month: "$_id.month",
        totalRevenue: 1,
        netIncome: 1,
      },
    },
    {
      $sort: { month: 1 },
    },
  ]);
};
const getMostOrderedCategoryData = async (organizations) => {
  const baseMatch = {
    ...(organizations && {
      organization: { $in: organizations },
    }),
  };

  const mostOrderedCategoryData = await MenuOrders.aggregate([
    { $match: baseMatch },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "menuitems", // Lookup menu item details
        localField: "items.menuItem",
        foreignField: "_id",
        as: "menuItemDetails",
      },
    },
    { $unwind: "$menuItemDetails" },
    {
      $group: {
        _id: "$menuItemDetails.category", // Group by category
        totalItemsSoldInCategory: { $sum: "$items.quantity" }, // Count of items in each category
      },
    },
    { $sort: { totalItemsSoldInCategory: -1 } }, // Sort by total items sold in descending order
    {
      $lookup: {
        from: "menuitemcategories", // Lookup category details
        localField: "_id",
        foreignField: "_id",
        as: "categoryDetails",
      },
    },
    { $unwind: "$categoryDetails" },
    {
      $group: {
        _id: null,
        categories: { $push: { category: "$categoryDetails.title", count: "$totalItemsSoldInCategory" } },
        totalItemsSold: { $sum: "$totalItemsSoldInCategory" },
      },
    },
    {
      $project: {
        categories: 1,
        totalItemsSold: 1,
        categoriesWithPercent: {
          $map: {
            input: "$categories",
            as: "category",
            in: {
              categoryName: "$$category.category",
              count: "$$category.count",
              percent: { $multiply: [{ $divide: ["$$category.count", "$totalItemsSold"] }, 100] }, // Calculate percentage
            },
          },
        },
      },
    },
    { $unwind: "$categoriesWithPercent" }, // Unwind the categories to make them individual documents
    {
      $project: {
        _id: 0,
        categoryName: "$categoriesWithPercent.categoryName",
        count: "$categoriesWithPercent.count",
        percent: "$categoriesWithPercent.percent",
      },
    },
  ]);

  return mostOrderedCategoryData;
};


const getReservationsByHourRaw = async (organizations) => {
  const year = new Date().getFullYear();
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return MenuOrders.aggregate([
    {
      $match: {
        ...(organizations && {
          organization: { $in: organizations },
        }),
        createdAt: { $gte: start, $lt: end },
      },
    },


    // extract hour from startTime (0–23)
    {
      $project: {
        hour: {
          $hour: "$createdAt",
        },
      },
    },
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


const getUserLevelStatsRaw = async (organizations) => {
  const result = await MenuOrders.aggregate([
    {
      $match: {
        user: { $ne: null },
        ...(organizations && {
          organization: { $in: organizations },
        }),
      },
    },

    // Unwind items array to work with individual items
    {
      $unwind: "$items",
    },

    // Group by userId and calculate counts for regular, upsell, and limited-time items
    {
      $group: {
        _id: "$userId",
        totalRegularItems: { $sum: 1 }, // Count each item as 1
        totalUpsellItems: {
          $sum: {
            $cond: [{ $eq: ["$items.menuItemSnapShot.upSellItem", true] }, 1, 0],
          },
        },
        totalLimitedItems: {
          $sum: {
            $cond: [{ $eq: ["$items.menuItemSnapShot.isLimitedTimeOffer", true] }, 1, 0],
          },
        },
      },
    },

    // Debug: Project values to check totals and conditions
    {
      $project: {
        userId: "$_id",
        totalRegularItems: 1,
        totalUpsellItems: 1,
        totalLimitedItems: 1,
        totalItems: {
          $add: [
            "$totalRegularItems",
            "$totalUpsellItems",
            "$totalLimitedItems",
          ], // Total count of all items
        },
      },
    },

    // Debug: Add fields to check totalItems and percentages before final calculation
    {
      $project: {
        userId: 1,
        totalRegularItems: 1,
        totalUpsellItems: 1,
        totalLimitedItems: 1,
        totalItems: 1,
        regularPercent: {
          $cond: [
            { $eq: ["$totalItems", 0] }, // Check for totalItems being 0
            0, // If totalItems is 0, set percentage to 0
            {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$totalRegularItems", "$totalItems"] },
                    100,
                  ],
                },
                2,
              ], // Regular item percentage
            },
          ],
        },
        upsellPercent: {
          $cond: [
            { $eq: ["$totalItems", 0] }, // Check for totalItems being 0
            0, // If totalItems is 0, set percentage to 0
            {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$totalUpsellItems", "$totalItems"] },
                    100,
                  ],
                },
                2,
              ], // Upsell item percentage
            },
          ],
        },
        limitedPercent: {
          $cond: [
            { $eq: ["$totalItems", 0] }, // Check for totalItems being 0
            0, // If totalItems is 0, set percentage to 0
            {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$totalLimitedItems", "$totalItems"] },
                    100,
                  ],
                },
                2,
              ], // Limited-time item percentage
            },
          ],
        },
      },
    },

    // Debugging: Project out the fields for inspection
    {
      $project: {
        userId: 1,
        totalRegularItems: 1,
        totalUpsellItems: 1,
        totalLimitedItems: 1,
        totalItems: 1,
        regularPercent: 1,
        upsellPercent: 1,
        limitedPercent: 1,
      },
    },
    {
      $project: {
        reservationData: [
          {
            reservationType: "Regular",
            count: "$totalRegularItems",
            percent: "$regularPercent",
          },
          {
            reservationType: "Upsell",
            count: "$totalUpsellItems",
            percent: "$upsellPercent",
          },
          {
            reservationType: "Limited",
            count: "$totalLimitedItems",
            percent: "$limitedPercent",
          },
        ],
      },
    },

    // Unwind the reservationData array
    {
      $unwind: "$reservationData",
    },
    {
      $project: {
        _id: 0,
        reservationType: "$reservationData.reservationType",
        count: "$reservationData.count",
        percent: "$reservationData.percent",
      },
    },

    // Sort by reservation type (optional)
    {
      $sort: { reservationType: 1 },
    },
  ]);


  return result;
};



const getUserReservationPaymentsQA = async ({
  organizations,
  page = 1,
  limit = 5,
}) => {
  const skip = (page - 1) * limit;

  const matchStage = {
    ...(organizations && {
      organization: { $in: organizations },
    }),
  };

  // 🔥 total count
  const totalFiltered = await MenuOrders.countDocuments(matchStage);

  // 🔥 main aggregation
  const data = await MenuOrders.aggregate([
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

    // ✅ FINAL SHAPE
    {
      $project: {
        _id: 1,

        paymentStatus: 1,
        totalPrice: 1,
        status: 1,
        paidAt: 1,
        paymentMethod: 1,
        createdAt: 1,
        user: {
          _id: "$user._id",
          firstName: "$user.firstName",
          lastName: "$user.lastName",
          profileIcon: "$user.profileIcon",
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
  organizations,
  page = 1,
  limit = 20,
}) => {
  const skip = (page - 1) * limit;

  const matchStage = {
    orderType: "userreservations",
    ...(organizations && {
      organization: { $in: organizations },
    }),
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





const getMenuItemSalesData = async ({ page = 1, limit = 5, organizations }) => {
  const skip = (page - 1) * limit;
  limit = parseInt(limit);

  try {


    // Step 1: Aggregate data to calculate sales count and final price per menu item
    const salesData = await MenuOrders.aggregate([
      // Match based on organizations if provided
      {
        $match: {
          ...(organizations && {
            organization: { $in: organizations }, // Directly use the organizations array
          }),
        },
      },

      // Unwind the items array to process each menu item
      { $unwind: "$items" },

      // Group by menuItem to calculate salesCount and totalPrice
      {
        $group: {
          _id: "$items.menuItem", // Use menuItem as _id to group
          salesCount: { $sum: "$items.quantity" },
          totalPrice: { $sum: "$items.finalPrice" },
          categoryId: { $first: "$items.menuItemSnapShot.category" }, // Capture the categoryId from menuItemSnapShot
          itemName: { $first: "$items.menuItemSnapShot.title" }, // Capture item name from menuItemSnapShot
        },
      },

      // Project only the necessary fields for the next steps
      {
        $project: {
          _id: 1,
          itemName: 1, // Include item name in the projection
          salesCount: 1,
          totalPrice: 1,
          categoryId: 1, // Keep categoryId for later use
        },
      },

      // Apply skip and limit for pagination
      { $skip: skip },
      { $limit: limit },
    ]);



    // Step 2: Perform a separate find query to get the category name for each categoryId
    const categoryIds = salesData.map(item => item.categoryId); // Get all categoryIds from the sales data

    // Find category names for the unique categoryIds
    const categoryDetails = await MenuItemCategories.find({
      _id: { $in: categoryIds },
    }).lean();

    // Map categoryId to category name for later reference
    const categoryNameMap = categoryDetails.reduce((acc, category) => {
      acc[category._id.toString()] = category.title;
      return acc;
    }, {});

    // Step 3: Combine the sales data with category names and item names
    const updatedSalesData = salesData.map(item => ({
      ...item,
      categoryName: categoryNameMap[item.categoryId.toString()] || "Unknown", // Use category name from map
      availabilityStatus: item.categoryId ? "Available" : "Unavailable", // Set availability status based on categoryId presence
    }));

    // Get the total filtered count for pagination metadata
    const totalFiltered = await MenuOrders.aggregate([
      {
        $match: {
          ...(organizations && { organization: { $in: organizations } }),
        },
      },
      // Unwind the items array to ensure each item is processed individually
      { $unwind: "$items" },
      // Group by the menuItem to get unique items
      {
        $group: {
          _id: "$items.menuItem", // Group by menuItem to count unique items
        },
      },
      // Count the number of unique menuItems
      {
        $count: "totalUniqueItems",
      },
    ]);

    // Get the count of unique items from the aggregation result
    const totalUniqueItems = totalFiltered.length > 0 ? totalFiltered[0].totalUniqueItems : 0;



    // Prepare metadata for pagination
    const meta = generateMeta(page, limit, totalUniqueItems);

    return { data: updatedSalesData, meta };
  } catch (error) {
    console.error("Error fetching menu item sales data:", error); // Log any errors
    throw new Error("Error fetching menu item sales data: " + error.message);
  }
};

module.exports = {

  orderStatsRaw,

  getOrganizerPerformanceByMonth,
  getUserSingleMetric,
  getEventSingleMetric,
  getTicketSingleMetric,
  getReservationsOverTimeRaw,
  getRawGlobalLoyaltyPointsDistributed,
  getRevenueOverTimeRaw,
  getMostOrderedCategoryData,
  getReservationsByHourRaw,
  getUserLevelStatsRaw,
  getUserReservationPaymentsQA,
  getUserReservationChangeLogs,
  getAverageOrderValueOverTimeRaw,
  getMenuItemSalesData
};