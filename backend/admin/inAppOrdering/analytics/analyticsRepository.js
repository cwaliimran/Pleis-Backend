const { User } = require("@UserModel");
const { Events } = require("@EventsModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { getDateRanges } = require("./utils/analyticsDate.utils");
const { UserInterests } = require("@UserInterests");
const SearchSuggestion = require("@SearchSuggestionModel");
const MenuSubcategory = require("@MenuSubcategoryModel");
const {
  UnifiedWalletTransactions,
} = require("@UnifiedWalletTransactionsModel");
const mongoose = require("mongoose");
const {
  getEarnTransactions,
} = require("../../transactions/repositories/unifiedTransactionsRepository");
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
const { salesMatch } = require("./orderAnalyticsMetrics");
const {
  buildUserReservationPaymentsQA,
} = require("./utils/buildUserReservationPaymentsQA");
const { buildUserChangeLogs } = require("./utils/buildUserChangeLogs");
const MenuOrders = require("../../../commonModules/menuItemsAndOrders/Orders");
const MenuItemCategories = require("@MenuItemCategoriesModel");
const MenuItemSubCategories = require("@MenuItemSubCategoriesModel");

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
  companyOrganizer,
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

const getRawGlobalLoyaltyPointsDistributed = async () => {
  return UnifiedWalletTransactions.aggregate([
    {
      $match: {
        walletType: "globalWallet",
      },
    },
    {
      $group: {
        _id: "$domainType",
        count: { $sum: 1 },
        points: { $sum: "$points.total" },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);
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
  const totalFiltered =
    await WebhookTransactionsEventModel.countDocuments(matchStage);

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

/**
 * Loyalty Impact Graph
 * - Loyalty = order user is an active ClubMembers for the org's company organizer
 * - Non-loyalty = ordered but has not joined the club
 * - Order Frequency (Loyalty): share of high-frequency orders from loyalty users
 * - Average Spend lift: how much more loyalty users spend per order vs non-loyalty
 */
const getLoyaltyImpactRaw = async ({ organizations, dateFilter, timezone }) => {
  const ranges = getDateRanges({ dateFilter, timezone });
  // Paid orders only (spend), in scope; an empty organization list matches nothing.
  const baseMatch = {
    user: { $ne: null },
    ...salesMatch(organizations, ranges?.start, ranges?.end),
  };

  const result = await MenuOrders.aggregate([
    { $match: baseMatch },

    // Resolve company organizer (org creator) for club membership lookup
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "org",
      },
    },
    { $unwind: { path: "$org", preserveNullAndEmptyArrays: true } },

    // Match active club membership for this user + company
    {
      $lookup: {
        from: "clubmembers",
        let: {
          userId: "$user",
          companyOrganizerId: "$org.creator",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$user", "$$userId"] },
                  { $eq: ["$companyOrganizer", "$$companyOrganizerId"] },
                  { $eq: ["$status", "active"] },
                ],
              },
            },
          },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: "clubMembership",
      },
    },
    {
      $addFields: {
        isLoyalty: { $gt: [{ $size: "$clubMembership" }, 0] },
      },
    },

    // Per-user order counts (for high-frequency classification)
    {
      $facet: {
        perUser: [
          {
            $group: {
              _id: "$user",
              orderCount: { $sum: 1 },
              isLoyalty: { $max: "$isLoyalty" },
            },
          },
        ],
        spend: [
          {
            $group: {
              _id: "$isLoyalty",
              orderCount: { $sum: 1 },
              totalSpend: { $sum: { $ifNull: ["$totalPrice", 0] } },
            },
          },
        ],
      },
    },
  ]);

  const facet = result[0] || { perUser: [], spend: [] };
  const perUser = facet.perUser || [];
  const spendRows = facet.spend || [];

  const loyaltySpend = spendRows.find((r) => r._id === true) || {
    orderCount: 0,
    totalSpend: 0,
  };
  const nonLoyaltySpend = spendRows.find((r) => r._id === false) || {
    orderCount: 0,
    totalSpend: 0,
  };

  const loyaltyAvgSpend =
    loyaltySpend.orderCount > 0
      ? loyaltySpend.totalSpend / loyaltySpend.orderCount
      : 0;
  const nonLoyaltyAvgSpend =
    nonLoyaltySpend.orderCount > 0
      ? nonLoyaltySpend.totalSpend / nonLoyaltySpend.orderCount
      : 0;

  // High-frequency = users with more than 1 order (repeat / frequent orderers)
  const highFrequencyUsers = perUser.filter((u) => u.orderCount > 1);
  const highFrequencyLoyaltyOrders = highFrequencyUsers
    .filter((u) => u.isLoyalty)
    .reduce((sum, u) => sum + u.orderCount, 0);
  const highFrequencyTotalOrders = highFrequencyUsers.reduce(
    (sum, u) => sum + u.orderCount,
    0,
  );

  // Fallback: if no repeat orderers yet, use all orders share from loyalty
  const frequencyBaseOrders =
    highFrequencyTotalOrders > 0
      ? highFrequencyTotalOrders
      : loyaltySpend.orderCount + nonLoyaltySpend.orderCount;
  const frequencyLoyaltyOrders =
    highFrequencyTotalOrders > 0
      ? highFrequencyLoyaltyOrders
      : loyaltySpend.orderCount;

  const orderFrequencyLoyaltyPercent =
    frequencyBaseOrders > 0
      ? Math.round((frequencyLoyaltyOrders / frequencyBaseOrders) * 100)
      : 0;

  const averageSpendLiftPercent =
    nonLoyaltyAvgSpend > 0
      ? Math.round(
          ((loyaltyAvgSpend - nonLoyaltyAvgSpend) / nonLoyaltyAvgSpend) * 100,
        )
      : 0;

  return {
    orderFrequencyLoyalty: {
      value: orderFrequencyLoyaltyPercent,
      loyaltyOrders: frequencyLoyaltyOrders,
      totalOrders: frequencyBaseOrders,
      usedHighFrequency: highFrequencyTotalOrders > 0,
    },
    averageSpend: {
      value: averageSpendLiftPercent,
      loyaltyAverage: Math.round(loyaltyAvgSpend * 100) / 100,
      nonLoyaltyAverage: Math.round(nonLoyaltyAvgSpend * 100) / 100,
      loyaltyOrders: loyaltySpend.orderCount,
      nonLoyaltyOrders: nonLoyaltySpend.orderCount,
    },
  };
};

const getMenuItemSalesData = async ({ page = 1, limit = 5, organizations }) => {
  page = parseInt(page);
  limit = parseInt(limit);
  const skip = (page - 1) * limit;

  try {
    // Step 1: Aggregate data to calculate sales count and final price per menu item
    const salesData = await MenuOrders.aggregate([
      // Match based on organizations if provided
      // Items sold: paid orders in scope (an empty organization list matches nothing).
      { $match: salesMatch(organizations) },

      // Unwind the items array to process each menu item
      { $unwind: "$items" },

      // Group by menuItem to calculate salesCount and totalPrice
      {
        $group: {
          _id: "$items.menuItem",
          salesCount: { $sum: "$items.quantity" },
          totalPrice: { $sum: "$items.finalPrice" },
          subCategory: { $first: "$items.menuItemSnapShot.subCategory" },
          itemName: { $first: "$items.menuItemSnapShot.title" },
        },
      },

      // Snapshot subCategory is missing on older orders — read it from the live item
      {
        $lookup: {
          from: "menuitems",
          localField: "_id",
          foreignField: "_id",
          as: "menuItemDoc",
        },
      },
      {
        $addFields: {
          subCategory: {
            $ifNull: [{ $first: "$menuItemDoc.subCategory" }, "$subCategory"],
          },
        },
      },

      // Project only the necessary fields for the next steps
      {
        $project: {
          _id: 1,
          itemName: 1,
          salesCount: 1,
          totalPrice: 1,
          subCategory: 1,
        },
      },

      // Best sellers first; stable order for paging
      { $sort: { salesCount: -1, itemName: 1, _id: 1 } },

      // Apply skip and limit for pagination
      { $skip: skip },
      { $limit: limit },
    ]);

    // Step 2: Look up subcategory titles — drop nulls so the $in query stays valid
    const subCategoryIds = salesData
      .map((item) => item.subCategory)
      .filter(Boolean);

    const subCategoryDetails = subCategoryIds.length
      ? await MenuSubcategory.find({ _id: { $in: subCategoryIds } })
          .select("_id title")
          .lean()
      : [];

    const subCategoryNameMap = subCategoryDetails.reduce((acc, subCategory) => {
      acc[subCategory._id.toString()] = subCategory.title;
      return acc;
    }, {});

    // Step 3: Combine the sales data with subcategory names and item names
    const updatedSalesData = salesData.map((item) => ({
      ...item,
      subCategoryName: item.subCategory
        ? subCategoryNameMap[String(item.subCategory)] || "Unknown"
        : "Unknown",
      availabilityStatus: item.subCategory ? "Available" : "Unavailable",
    }));

    // Get the total filtered count for pagination metadata
    const totalFiltered = await MenuOrders.aggregate([
      { $match: salesMatch(organizations) },
      { $unwind: "$items" },
      { $group: { _id: "$items.menuItem" } },
      { $count: "totalUniqueItems" },
    ]);

    const totalUniqueItems =
      totalFiltered.length > 0 ? totalFiltered[0].totalUniqueItems : 0;

    const meta = generateMeta(page, limit, totalUniqueItems);

    return { data: updatedSalesData, meta };
  } catch (error) {
    console.error("Error fetching menu item sales data:", error);
    throw new Error("Error fetching menu item sales data: " + error.message);
  }
};

module.exports = {

  getOrganizerPerformanceByMonth,
  getUserSingleMetric,
  getEventSingleMetric,
  getTicketSingleMetric,
  getRawGlobalLoyaltyPointsDistributed,
  getUserReservationPaymentsQA,
  getUserReservationChangeLogs,
  getMenuItemSalesData,
  getLoyaltyImpactRaw,
};
