const { User } = require("@UserModel");
const { Events } = require("@EventsModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { getDateRanges } = require("./utils/dashboardDate.utils");
const { UserInterests } = require("@UserInterests");
const SearchSuggestion = require("@SearchSuggestionModel");
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel");
const mongoose = require("mongoose");
const { getEarnTransactions } = require("../transactions/repositories/unifiedTransactionsRepository");



// ---------------- USERS ----------------
const getUserStats = async ({ dateFilter, timezone }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const baseMatch = {
    "accountState.status": { $ne: "deleted" },
  };

  const withRange = (extra, range) => ({
    ...baseMatch,
    ...extra,
    ...(range ? { createdAt: range } : {}),
  });

  return {
    totalUsersCurrent: await User.countDocuments(
      withRange(
        { "accountState.userType": "user" },
        ranges && { $gte: ranges.start, $lt: ranges.end }
      )
    ),

    totalUsersPrevious: ranges
      ? await User.countDocuments(
        withRange(
          { "accountState.userType": "user" },
          { $gte: ranges.prevStart, $lt: ranges.prevEnd }
        )
      )
      : 0,

    organizersCurrent: await User.countDocuments(
      withRange(
        { "accountState.userType": "organizer" },
        ranges && { $gte: ranges.start, $lt: ranges.end }
      )
    ),

    organizersPrevious: ranges
      ? await User.countDocuments(
        withRange(
          { "accountState.userType": "organizer" },
          { $gte: ranges.prevStart, $lt: ranges.prevEnd }
        )
      )
      : 0,

    activeUsersCurrent: await User.countDocuments(
      withRange(
        {
          "accountState.userType": "user",
          "accountState.status": "active",
        },
        ranges && { $gte: ranges.start, $lt: ranges.end }
      )
    ),

    activeUsersPrevious: ranges
      ? await User.countDocuments(
        withRange(
          {
            "accountState.userType": "user",
            "accountState.status": "active",
          },
          { $gte: ranges.prevStart, $lt: ranges.prevEnd }
        )
      )
      : 0,
  };
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
const getEventStats = async ({ dateFilter, timezone, status }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

const baseMatch = {
  ...(status === "active"
    ? { status: "active" }
    : { status: { $ne: "deleted" } })
};

  const withRange = (extra, range) => ({
    ...baseMatch,
    ...extra,
    ...(range ? { createdAt: range } : {}),
  });

  const [
    totalEventsCurrent,
    totalEventsPrevious
  ] = await Promise.all([
    Events.countDocuments(
      withRange({}, ranges && { $gte: ranges.start, $lt: ranges.end })
    ),
    ranges
      ? Events.countDocuments(
        withRange({}, { $gte: ranges.prevStart, $lt: ranges.prevEnd })
      )
      : Promise.resolve(0)
  ]);

  return {
    totalEventsCurrent,
    totalEventsPrevious
  };
};


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


//get ticket sold stats

// ---------------- SINGLE METRICS ----------------

const getTicketsSoldStats = async ({ dateFilter, timezone }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const baseMatch = {
    purpose: "eventTicketPurchase",
  };

  const countTickets = async (range) => {
    return TicketingOrders.countDocuments({
      ...baseMatch,
      ...(range && { createdAt: range }),
    });
  };

  const [
    ticketsSoldCurrent,
    ticketsSoldPrevious,
  ] = await Promise.all([
    countTickets(ranges && { $gte: ranges.start, $lt: ranges.end }),
    ranges
      ? countTickets({ $gte: ranges.prevStart, $lt: ranges.prevEnd })
      : Promise.resolve(0),
  ]);

  return {
    ticketsSoldCurrent,
    ticketsSoldPrevious,
  };
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


const getAverageTicketPriceStats = async ({ dateFilter, timezone }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const baseMatch = {
    purpose: "eventTicketPurchase",
    // status: { $in: ["confirmed", "completed"] },
    // "paymentDetails.paymentStatus": "completed",
    ticketsPurchased: { $gt: 0 },
  };

  const getAverage = async (range) => {
    const result = await TicketingOrders.aggregate([
      {
        $match: {
          ...baseMatch,
          ...(range && { createdAt: range }),
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$orderPricing.total" },
          totalTickets: { $sum: "$ticketsPurchased" },
        },
      },
      {
        $project: {
          _id: 0,
          averageTicketPrice: {
            $cond: [
              { $eq: ["$totalTickets", 0] },
              0,
              { $divide: ["$totalRevenue", "$totalTickets"] },
            ],
          },
        },
      },
    ]);

    return result[0]?.averageTicketPrice ? Number(result[0].averageTicketPrice.toFixed(2)) : 0;
  };

  const [
    avgTicketPriceCurrent,
    avgTicketPricePrevious,
  ] = await Promise.all([
    getAverage(ranges && { $gte: ranges.start, $lt: ranges.end }),
    ranges
      ? getAverage({ $gte: ranges.prevStart, $lt: ranges.prevEnd })
      : Promise.resolve(0),
  ]);

  return {
    current: avgTicketPriceCurrent,
    previous: avgTicketPricePrevious,
  };
};

const getOrganizerPerformanceByMonth = async ({
  organizerId,
  organizationId,
  timezone = "UTC",
  year = new Date().getFullYear(),
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
        createdAt: 1
      }
    }
  ]);

  return users;
};



const getRawInterestData = async () => {
  return UserInterests.aggregate([
    /* Join user (gender only) */
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" },

    /* Only active users */
    {
      $match: {
        "user.accountState.status": "active"
      }
    },

    /* Explode categories */
    { $unwind: "$categories" },

    /* Join category title */
    {
      $lookup: {
        from: "categories",
        localField: "categories",
        foreignField: "_id",
        as: "category"
      }
    },
    { $unwind: "$category" },

    /* Minimal projection */
    {
      $project: {
        categoryId: "$category._id",
        categoryTitle: "$category.title",
        gender: "$user.gender"
      }
    }
  ]);
};


const getRawSearchStats = async () => {
  let year = new Date().getFullYear()
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return SearchSuggestion.find(
    {
      createdAt: { $gte: start, $lt: end }
    },
    {
      count: 1,
      lastSearchedAt: 1,
      createdAt: 1
    }
  ).lean();
};


const getRawTopPerformingOrganizers = async () => {
  return UnifiedWalletTransactions.aggregate([
    /* --------------------------------
       1️⃣ FILTER RELEVANT TRANSACTIONS
    -------------------------------- */
    {
      $match: {
        walletType: "companyLoyalty",
        companyOrganizer: { $ne: null }
      }
    },

    /* --------------------------------
       2️⃣ GROUP PER ORGANIZER
    -------------------------------- */
    {
      $group: {
        _id: "$companyOrganizer",
        revenue: { $sum: "$points.total" },
        transactions: { $sum: 1 },
        users: { $addToSet: "$user" }
      }
    },

    /* --------------------------------
       3️⃣ SHAPE LIGHT DATA
    -------------------------------- */
    {
      $project: {
        revenue: 1,
        transactions: 1,
        uniqueUsers: { $size: "$users" }
      }
    },

    /* --------------------------------
       4️⃣ JOIN ORGANIZER USER (ONCE)
    -------------------------------- */
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "organizer"
      }
    },
    { $unwind: "$organizer" },

    /* --------------------------------
       5️⃣ PROJECT ONLY REQUIRED FIELDS
    -------------------------------- */
    {
      $project: {
        revenue: 1,
        transactions: 1,
        uniqueUsers: 1,
        organizerName: "$organizer.companyDetails.name",
        organizerLogo: "$organizer.companyDetails.logo"
      }
    }
  ]);
};

const getEventsOverTimeRaw = async () => {
  let year = new Date().getFullYear()
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return Events.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    },
    {
      $project: {
        month: { $month: "$createdAt" }
      }
    },
    {
      $group: {
        _id: "$month",
        events: { $sum: 1 }
      }
    }
  ]);
};

const getAverageRevenuePerUserStats = async ({ dateFilter, timezone }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const getRevenue = async (range) => {
    const result = await TicketingOrders.aggregate([
      {
        $match: {
          purpose: "eventTicketPurchase",
          ...(range && { createdAt: range }),
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$orderPricing.total" },
        },
      },
    ]);

    return result[0]?.totalRevenue || 0;
  };

  const [
    revenueCurrent,
    revenuePrevious,
    activeUsersCurrent,
    activeUsersPrevious,
  ] = await Promise.all([
    getRevenue(ranges && { $gte: ranges.start, $lt: ranges.end }),
    ranges
      ? getRevenue({ $gte: ranges.prevStart, $lt: ranges.prevEnd })
      : 0,
    User.countDocuments({
      "accountState.userType": "user",
      "accountState.status": "active",
      ...(ranges && { createdAt: { $gte: ranges.start, $lt: ranges.end } }),
    }),
    ranges
      ? User.countDocuments({
        "accountState.userType": "user",
        "accountState.status": "active",
        createdAt: { $gte: ranges.prevStart, $lt: ranges.prevEnd },
      })
      : 0,
  ]);

  return {
    current:
      activeUsersCurrent === 0
        ? 0
        : Number((revenueCurrent / activeUsersCurrent).toFixed(2)),

    previous:
      activeUsersPrevious === 0
        ? 0
        : Number((revenuePrevious / activeUsersPrevious).toFixed(2)),
  };
};

const getTotalTrendSales = async () => {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  const transsections = await UnifiedWalletTransactions.aggregate([
    {
      $match: {
        type: "earn",
        $expr: {
          $in: [{ $year: "$createdAt" }, [currentYear, previousYear]]
        }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" }
        },
        totalPoints: { $sum: "$points.total" }
      }
    },
    {
      $group: {
        _id: "$_id.year",
        months: {
          $push: {
            month: "$_id.month",
            totalPoints: "$totalPoints"
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        year: "$_id",
        months: 1
      }
    },
    {
      $sort: { year: -1 }
    }
  ]);
  return transsections;
};

const getTotalTrendRevenue = async () => {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  const REVENUE_PERCENT = 0.06; // e.g. 6%

  const transactions = await UnifiedWalletTransactions.aggregate([
    {
      $match: {
        type: "earn",
        $expr: {
          $in: [{ $year: "$createdAt" }, [currentYear, previousYear]]
        }
      }
    },
    {
      $project: {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
        revenue: {
          $multiply: ["$points.total", REVENUE_PERCENT] 
        }
      }
    },
    {
      $group: {
        _id: {
          year: "$year",
          month: "$month"
        },
        totalPoints: { $sum: "$revenue" } 
      }
    },
    {
      $group: {
        _id: "$_id.year",
        months: {
          $push: {
            month: "$_id.month",
            totalPoints: "$totalPoints"
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        year: "$_id",
        months: 1
      }
    },
    {
      $sort: { year: -1 }
    }
  ]);

  return transactions;
};

module.exports = {
  getOrganizerPerformanceByMonth,
  getUserStats,
  getUserSingleMetric,
  getEventStats,
  getEventSingleMetric,
  getTicketsSoldStats,
  getTicketSingleMetric,
  getAverageTicketPriceStats,
  getUsersForDashboardAnalytics,
  getRawInterestData,
  getRawSearchStats,
  getRawTopPerformingOrganizers,
  getEventsOverTimeRaw,
  getAverageRevenuePerUserStats,
  getTotalTrendSales,
  getTotalTrendRevenue
};