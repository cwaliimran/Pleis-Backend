const { User } = require("@UserModel");
const { Events } = require("@EventsModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { getDateRanges } = require("./utils/dashboardDate.utils");
const { UserInterests } = require("@UserInterests");
const SearchSuggestion = require("@SearchSuggestionModel");
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel");
const mongoose = require("mongoose");
const { getEarnTransactions } = require("../transactions/repositories/unifiedTransactionsRepository");
const MonriTransaction = require("../../commonModules/paymentsIntegrations/monri/MonriTransaction");
const { ClubMembers } = require("@ClubMembersModel");
const Organizations = require("@OrganizationModel");
const { UserReservations } = require("@UserReservationsModel");
const Reservations = require("@ReservationsModel");
const EngagementEvents = require("@appEngagement/EngagementEvents");


const getClubMembersStats = async ({ companyOrganizer, dateFilter, timezone }) => {
  const ranges = getDateRanges({ dateFilter, timezone });
  const baseMatch = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
  };

  const getCount = async (Model, baseMatch, extra, range) => {
    const finalMatch = {
      ...baseMatch,
      ...extra,
      ...(range && { createdAt: range }),
    };

    return Model.countDocuments(finalMatch);
  };

  return {
    totalClubMembersCurrent: await getCount(
      ClubMembers,
      baseMatch,
      {},
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    totalClubMembersPrevious: ranges
      ? await getCount(
        ClubMembers,
        baseMatch,
        {},
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,

    activeClubMembersCurrent: await getCount(
      ClubMembers,
      baseMatch,
      { status: "active" },
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    activeClubMembersPrevious: ranges
      ? await getCount(
        ClubMembers,
        baseMatch,
        { status: "active" },
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,

    inactiveClubMembersCurrent: await getCount(
      ClubMembers,
      baseMatch,
      { status: "inactive" },
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    inactiveClubMembersPrevious: ranges
      ? await getCount(
        ClubMembers,
        baseMatch,
        { status: "inactive" },
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,

    bannedClubMembersCurrent: await getCount(
      ClubMembers,
      baseMatch,
      { status: "banned" },
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    bannedClubMembersPrevious: ranges
      ? await getCount(
        ClubMembers,
        baseMatch,
        { status: "banned" },
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,

    leftClubMembersCurrent: await getCount(
      ClubMembers,
      baseMatch,
      { status: "left" },
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    leftClubMembersPrevious: ranges
      ? await getCount(
        ClubMembers,
        baseMatch,
        { status: "left" },
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,
  };
};
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
      "verificationStatus.email": "verified",
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
    };
  }
  if (companyOrganizer) {

    const baseMatch = {
      creator: new mongoose.Types.ObjectId(companyOrganizer),
      status: { $ne: "deleted" },
    };

    const getStaffCount = async (extraMatch = {}, range) => {
      const result = await Organizations.aggregate([
        {
          $match: {
            ...baseMatch,
            ...(range && { createdAt: range }),
          },
        },
        {
          $unwind: "$staff",
        },
        {
          $match: {
            ...extraMatch, // optional filters later
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
          },
        },
      ]);

      return result[0]?.count || 0;
    };

    return {
      totalUsersCurrent: await getStaffCount(
        {},
        ranges && { $gte: ranges.start, $lt: ranges.end }
      ),

      totalUsersPrevious: ranges
        ? await getStaffCount({}, {
          $gte: ranges.prevStart,
          $lt: ranges.prevEnd,
        })
        : 0,

      // NOTE: You DON'T have status in staff → so these will be same unless you join Users
      activeUsersCurrent: await getStaffCount(
        {},
        ranges && { $gte: ranges.start, $lt: ranges.end }
      ),

      activeUsersPrevious: ranges
        ? await getStaffCount({}, {
          $gte: ranges.prevStart,
          $lt: ranges.prevEnd,
        })
        : 0,

      inactiveUsersCurrent: 0,
      inactiveUsersPrevious: 0,

      bannedUsersCurrent: 0,
      bannedUsersPrevious: 0,

      leftUsersCurrent: 0,
      leftUsersPrevious: 0,
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
const getEventStats = async ({ dateFilter, timezone, status, companyOrganizer }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const baseMatch = {
    ...(status === "active"
      ? { status: "active" }
      : { status: { $ne: "deleted" } }),

    $or: [
      { "recurringMeta.isTemplate": false },
      { "recurringMeta.isTemplate": { $exists: false } }
    ],

    ...(companyOrganizer && {
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer)
    })
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

const getTicketsSoldStats = async ({ dateFilter, timezone, companyOrganizer }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const baseMatch = {
    purpose: "eventTicketPurchase",
    ...(companyOrganizer && {
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer)
    })
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


const getAverageTicketPriceStats = async ({ dateFilter, timezone, companyOrganizer }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const baseMatch = {
    purpose: "eventTicketPurchase",
    ...(companyOrganizer && {
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer)
    }),
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
        createdAt: 1
      }
    }
  ]);

  return users;
};
const getOrganizerUsersForDashboardAnalytics = async (
  companyOrganizer,
  year = new Date().getFullYear()
) => {
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const users = await ClubMembers.aggregate([
    // 1️⃣ Match club members for this organizer
    {
      $match: {
        companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
      },
    },

    // 2️⃣ Get unique users (optional but safe)
    {
      $group: {
        _id: "$user",
      },
    },

    // 3️⃣ Join with Users collection
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },

    // 4️⃣ Flatten user
    {
      $unwind: "$user",
    },

    // 5️⃣ Apply filters
    {
      $match: {
        "user.accountState.status": "active",
        "user.createdAt": { $gte: start, $lt: end },
      },
    },

    // 6️⃣ Return required fields
    {
      $project: {
        _id: "$user._id",
        gender: "$user.gender",
        dob: "$user.dob",
        timezone: "$user.timezone",
        createdAt: "$user.createdAt",
      },
    },
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
const getRawInterestDataByOrganizer = async (usersList = []) => {
  // extract only IDs
  const userIds = usersList.map(u => new mongoose.Types.ObjectId(u._id));

  return UserInterests.aggregate([
    // ✅ Filter only provided users FIRST (important for performance)
    {
      $match: {
        user: { $in: userIds },
      }
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

const getAverageRevenuePerUserStats = async ({ dateFilter, timezone, companyOrganizer }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const getRevenue = async (range) => {
    const result = await TicketingOrders.aggregate([
      {
        $match: {
          purpose: "eventTicketPurchase",
          ...(companyOrganizer && { companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer) }),
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

const getTotalTrendSales = async (companyOrganizer) => {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  const transsections = await UnifiedWalletTransactions.aggregate([
    {
      $match: {
        type: "earn",
        ...(companyOrganizer && { companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer) }),
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

const getTotalTrendRevenue = async (companyOrganizer) => {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  const REVENUE_PERCENT = 0.06; // e.g. 6%

  const transactions = await UnifiedWalletTransactions.aggregate([
    {
      $match: {
        type: "earn",
        ...(companyOrganizer && { companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer) }),
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
const getTotalRevenueStats = async ({ dateFilter, timezone, companyOrganizer }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const REVENUE_PERCENT = 0.06; //  change this (e.g. 6%)

  const getRevenue = async (range) => {
    const result = await UnifiedWalletTransactions.aggregate([
      {
        $match: {
          type: "earn",
          ...(range && { createdAt: range }),
          ...(companyOrganizer && { companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer) }),

        },
      },
      {
        $project: {
          revenue: {
            $multiply: ["$points.total", REVENUE_PERCENT]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$revenue" }
        }
      }
    ]);

    return result[0]?.totalRevenue || 0;
  };

  const [totalRevenueCurrent, totalRevenuePrevious] = await Promise.all([
    getRevenue(ranges && { $gte: ranges.start, $lt: ranges.end }),
    ranges
      ? getRevenue({ $gte: ranges.prevStart, $lt: ranges.prevEnd })
      : 0,
  ]);

  return {
    totalRevenueCurrent: Number(totalRevenueCurrent.toFixed(2)),
    totalRevenuePrevious: Number(totalRevenuePrevious.toFixed(2)),
  };
};
const getTotalMobilePaymentsStats = async ({ dateFilter, timezone, }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const getPayments = async (range) => {
    const result = await MonriTransaction.aggregate([
      {
        $match: {
          // status: "paid",
          ...(range && { createdAt: range }),
        },
      },
      {
        $group: {
          _id: null,
          totalPayments: { $sum: "$amount" }
        }
      }
    ]);

    return result[0]?.totalPayments || 0;
  };

  const [totalPaymentsCurrent, totalPaymentsPrevious] = await Promise.all([
    getPayments(ranges && { $gte: ranges.start, $lt: ranges.end }),
    ranges
      ? getPayments({ $gte: ranges.prevStart, $lt: ranges.prevEnd })
      : 0,
  ]);

  return {
    totalPaymentsCurrent: Number(totalPaymentsCurrent.toFixed(2)),
    totalPaymentsPrevious: Number(totalPaymentsPrevious.toFixed(2)),
  };
};
const getOrganizationsStats = async ({ dateFilter, timezone, companyOrganizer }) => {
  const ranges = getDateRanges({ dateFilter, timezone });
  const getOrganizations = async (range) => {
    const result = await Organizations.aggregate([
      {
        $match: {
          status: { $ne: "deleted" },
          ...(companyOrganizer && {
            creator: new mongoose.Types.ObjectId(companyOrganizer),
          }),
          ...(range && { createdAt: range }),
        },
      },
      {
        $group: {
          _id: null,
          totalOrganizations: { $sum: 1 },
        },
      },
    ]);

    return result[0]?.totalOrganizations || 0;
  };

  const [totalOrganizationsCurrent, totalOrganizationsPrevious] = await Promise.all([
    getOrganizations(ranges && { $gte: ranges.start, $lt: ranges.end }),
    ranges
      ? getOrganizations({ $gte: ranges.prevStart, $lt: ranges.prevEnd })
      : 0,
  ]);

  return {
    totalOrganizationsCurrent,
    totalOrganizationsPrevious,
  };
};
const getReservationsStats = async ({ companyOrganizer, dateFilter, timezone }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const baseMatch = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
  };

  const getCount = async (Model, baseMatch, extra, range) => {
    const finalMatch = {
      ...baseMatch,
      ...extra,
      ...(range && { createdAt: range }),
    };

    return Model.countDocuments(finalMatch);
  };

  return {
    // Total Reservations
    totalReservationsCurrent: await getCount(
      Reservations,
      baseMatch,
      {},
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    totalReservationsPrevious: ranges
      ? await getCount(
        Reservations,
        baseMatch,
        {},
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,

    // Active Reservations
    activeReservationsCurrent: await getCount(
      Reservations,
      baseMatch,
      { status: "active" },
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    activeReservationsPrevious: ranges
      ? await getCount(
        Reservations,
        baseMatch,
        { status: "active" },
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,

    // Inactive Reservations
    inactiveReservationsCurrent: await getCount(
      Reservations,
      baseMatch,
      { status: "inactive" },
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    inactiveReservationsPrevious: ranges
      ? await getCount(
        Reservations,
        baseMatch,
        { status: "inactive" },
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,

    // Deleted Reservations
    deletedReservationsCurrent: await getCount(
      Reservations,
      baseMatch,
      { status: "deleted" },
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    deletedReservationsPrevious: ranges
      ? await getCount(
        Reservations,
        baseMatch,
        { status: "deleted" },
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,
  };
};
const getBookedReservationsStats = async ({ companyOrganizer, dateFilter, timezone }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const baseMatch = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
  };

  const getCount = async (Model, baseMatch, extra, range) => {
    const finalMatch = {
      ...baseMatch,
      ...extra,
      ...(range && { createdAt: range }),
    };

    return Model.countDocuments(finalMatch);
  };

  return {
    // Total Booked Reservations
    totalBookedReservationsCurrent: await getCount(
      UserReservations,
      baseMatch,
      {},
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    totalBookedReservationsPrevious: ranges
      ? await getCount(
        UserReservations,
        baseMatch,
        {},
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,

    // Confirmed
    confirmedReservationsCurrent: await getCount(
      UserReservations,
      baseMatch,
      { status: "confirmed" },
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    confirmedReservationsPrevious: ranges
      ? await getCount(
        UserReservations,
        baseMatch,
        { status: "confirmed" },
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,

    // Completed
    completedReservationsCurrent: await getCount(
      UserReservations,
      baseMatch,
      { status: "completed" },
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    completedReservationsPrevious: ranges
      ? await getCount(
        UserReservations,
        baseMatch,
        { status: "completed" },
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,

    // Cancelled
    cancelledReservationsCurrent: await getCount(
      UserReservations,
      baseMatch,
      { status: "cancelled" },
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    cancelledReservationsPrevious: ranges
      ? await getCount(
        UserReservations,
        baseMatch,
        { status: "cancelled" },
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,

    // Pending Payment
    pendingPaymentReservationsCurrent: await getCount(
      UserReservations,
      baseMatch,
      { status: "pendingPayment" },
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    pendingPaymentReservationsPrevious: ranges
      ? await getCount(
        UserReservations,
        baseMatch,
        { status: "pendingPayment" },
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,

    // Checked In
    checkedInReservationsCurrent: await getCount(
      UserReservations,
      baseMatch,
      { status: "checkedIn" },
      ranges && { $gte: ranges.start, $lt: ranges.end }
    ),

    checkedInReservationsPrevious: ranges
      ? await getCount(
        UserReservations,
        baseMatch,
        { status: "checkedIn" },
        { $gte: ranges.prevStart, $lt: ranges.prevEnd }
      )
      : 0,
  };
};
const getEventsViewsOverTimeService = async (companyOrganizer) => {
  const year = new Date().getFullYear();

  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return EngagementEvents.aggregate([
    // 1️⃣ Match only event views in date range
    {
      $match: {
        entityType: "events",
        action: "view",
        createdAt: { $gte: start, $lt: end },
      },
    },

    // 2️⃣ Join with Events to filter by organizer
    {
      $lookup: {
        from: "events",
        localField: "entityId",
        foreignField: "_id",
        as: "event",
      },
    },

    // 3️⃣ Flatten event
    {
      $unwind: "$event",
    },

    // 4️⃣ Filter by companyOrganizer
    {
      $match: {
        "event.companyOrganizer": new mongoose.Types.ObjectId(companyOrganizer),
        "event.status": { $ne: "deleted" },
      },
    },

    // 5️⃣ Extract month
    {
      $project: {
        month: { $month: "$createdAt" },
      },
    },

    // 6️⃣ Group by month
    {
      $group: {
        _id: "$month",
        events: { $sum: 1 }, // count of views
      },
    },

    // 7️⃣ Optional: sort months
    {
      $sort: { _id: 1 },
    },
  ]);
};
const getTopViewedEvents = async (companyOrganizer) => {
  const year = new Date().getFullYear();

  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return EngagementEvents.aggregate([
    {
      $match: {
        entityType: "events",
        action: "view",
        createdAt: { $gte: start, $lt: end },
      },
    },
    {
      $lookup: {
        from: "events",
        localField: "entityId",
        foreignField: "_id",
        as: "event",
      },
    },
    { $unwind: "$event" },

    // 4️⃣ Filter by organizer
    {
      $match: {
        "event.companyOrganizer": new mongoose.Types.ObjectId(companyOrganizer),
        "event.status": { $ne: "deleted" },
      },
    },
    {
      $group: {
        _id: "$event._id",
        totalViews: { $sum: 1 },
        title: { $first: "$event.basicInfo.title" }, // optional
      },
    },
    {
      $sort: { totalViews: -1 },
    },
    {
      $limit: 6,
    },
    {
      $project: {
        _id: 0,
        eventId: "$_id",
        title: 1,
        totalViews: 1,
      },
    },
  ]);
};

const getFollowersOverTimeRaw = async (companyOrganizer) => {
  const year = new Date().getFullYear();

  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return ClubMembers.aggregate([
    // 1️⃣ Match organizer + date range
    {
      $match: {
        companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
        createdAt: { $gte: start, $lt: end },
      },
    },

    // 2️⃣ Extract month
    {
      $project: {
        month: { $month: "$createdAt" },
      },
    },

    // 3️⃣ Group by month (followers count)
    {
      $group: {
        _id: "$month",
        followers: { $sum: 1 },
      },
    },

    // 4️⃣ Sort by month
    {
      $sort: { _id: 1 },
    },
  ]);
};
const getRawTopPerformingEvents = async (companyOrganizer) => {
  return TicketingOrders.aggregate([
    /* --------------------------------
       1️⃣ FILTER RELEVANT TRANSACTIONS
    -------------------------------- */
    {
      $match: {
        purpose: "eventTicketPurchase",
        companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer)
      }
    },

    {
      $group: {
        _id: "$event",
        revenue: { $sum: "$orderPricing.subtotal" },
        transactions: { $sum: 1 },
      }
    },


    /* --------------------------------
       4️⃣ JOIN ORGANIZER USER (ONCE)
    -------------------------------- */
    {
      $lookup: {
        from: "events",
        localField: "_id",
        foreignField: "_id",
        as: "event"
      }
    },
    { $unwind: "$event" },

    /* --------------------------------
       5️⃣ PROJECT ONLY REQUIRED FIELDS
    -------------------------------- */
    {
      $project: {
        revenue: 1,
        transactions: 1,
        uniqueUsers: 1,
        eventName: "$event.basicInfo.title",
        eventLogo: "$event.basicInfo.media.name"
      }
    }
  ]);
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
  getTotalTrendRevenue,
  getTotalRevenueStats,
  getTotalMobilePaymentsStats,
  getOrganizationsStats,
  getClubMembersStats,
  getReservationsStats,
  getBookedReservationsStats,
  getOrganizerUsersForDashboardAnalytics,
  getRawInterestDataByOrganizer,
  getEventsViewsOverTimeService,
  getTopViewedEvents,
  getFollowersOverTimeRaw,
  getRawTopPerformingEvents

};