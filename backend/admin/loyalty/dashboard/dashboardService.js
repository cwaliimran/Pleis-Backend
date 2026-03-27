const dashboardRepo = require("./dashboardRepository");
const { calculateGrowth } = require("./utils/dashboardDate.utils");
const { DASHBOARD_KEYS, withSubFilters } = require("./utils/dashboardKeyMap");
const { buildUserDashboardAnalytics } = require("./utils/buildUsersDashboardAnalytics");
const { buildNewUsersDashboardAnalytics } = require("./utils/buildNewUsersDashboardAnalytics");
const { buildUserStatusAnalytics } = require("./utils/buildUserStatusAnalytics");
const { buildGlobalLoyaltyPointsOverTime } = require("./utils/buildGlobalLoyaltyPointsOverTime");
const { buildGlobalLoyaltyPointsPertWalletType } = require("./utils/buildGlobalLoyaltyPointsPertWalletType ");
const { buildGlobalLevelAnalytics } = require("./utils/buildGlobalLevelAnalytics");
const { buildGlobalLoyaltyProducts } = require("./utils/buildGlobalLoyaltyProducts");
const { buildGlobalLoyaltySpendingOverTime } = require("./utils/buildGlobalLoyaltySpendingOverTime");
const { buildGlobalLoyaltySpendingByGender } = require("./utils/buildGlobalLoyaltySpendingByGender");

/**
 * DASHBOARD – Load all cards at once
 */
const getDashboard = async ({ dateFilter, timezone, companyOrganizer }) => {
  const clubmembersUserIds = await dashboardRepo.getClubMemberUserIds(companyOrganizer);
  const promises = [
    dashboardRepo.getUserStats({ dateFilter, timezone, clubmembersUserIds }),
    getUsersDashboardAnalytics(clubmembersUserIds),
    getNewUsersDashboardAnalytics(clubmembersUserIds),
    dashboardRepo.getGlobalWalletStats({ dateFilter, timezone, companyOrganizer }),
    getGlobalWalletPointsOverTimeRaw(companyOrganizer),
    getRawGlobalLoyaltyPointsDistributed(),
    getUsersPerGlobalLevel(),
    getGlobalRewardsUsageStats(),
    dashboardRepo.getTopOrderedMenuItems(),
    dashboardRepo.getUsersPointsSummary(),
    getGlobalWalletSpendingOverTimeRaw(),
    getGlobalWalletSpendingByGenderOverTimeRaw(),
    dashboardRepo.getTotalPriceByPaymentStatus(),
  ];

  const [
    users, // used
    usersDashboardAnalytics, //used
    newUsersDashboardAnalytics,// used 
    globalloyaltyWalletStats,// used
    globalWalletPointsOverTime,// used
    globalLoyaltyPointsDistributed,// used
    usersPerGlobalLevel, // used
    globalRewardsUsageStats,// used
    topOrderedMenuItems, // used
    usersPointsSummary, // used
    globalWalletSpendingOverTime, // used
    globalWalletSpendingByGenderOverTime, // used
    totalPriceByPaymentStatus
  ] = await Promise.all(promises);
  const membersActivity = await getUserStatusAnalytics(
    users.allActiveUsersCurrent,
    users.allInactiveUsersCurrent
  );
  return {
    stats: [
      // ---------------- USERS ----------------
      {    // used 
        key: "totalUsers",
        title: DASHBOARD_KEYS.totalUsers.title,
        value: users.totalUsersCurrent || 0,
        growth: calculateGrowth(
          users.totalUsersCurrent,
          users.totalUsersPrevious
        ),
        ...withSubFilters("totalUsers"),
      },
      {
        key: "activeUsers",  // used 
        title: DASHBOARD_KEYS.activeUsers.title,
        value: users.activeUsersCurrent || 0,
        growth: calculateGrowth(
          users.activeUsersCurrent,
          users.activeUsersPrevious
        ),
        ...withSubFilters("activeUsers"),
      },
      {
        key: "inactiveUsers",  // used 
        title: DASHBOARD_KEYS.inactiveUsers.title,
        value: users.inactiveUsersCurrent || 0,
        growth: calculateGrowth(
          users.inactiveUsersCurrent,
          users.inactiveUsersPrevious
        ),
        ...withSubFilters("inactiveUsers"),
      },
      {
        key: "newUsers",  // used 
        title: DASHBOARD_KEYS.newUsers.title,
        value: users.newUsersCurrent || 0,
        growth: calculateGrowth(
          users.newUsersCurrent,
          users.newUsersPrevious
        ),
        ...withSubFilters("newUsers"),
      },

    ].filter(Boolean),
    ...(!companyOrganizer && { usersDashboardAnalytics }),
    newUsersDashboardAnalytics,
    membersActivity,
    globalloyaltyWalletStats,
    globalWalletPointsOverTime,
    globalLoyaltyPointsDistributed,
    usersPerGlobalLevel,
    globalRewardsUsageStats,
    topOrderedMenuItems,
    usersPointsSummary,
    globalWalletSpendingOverTime,
    globalWalletSpendingByGenderOverTime,
    totalPriceByPaymentStatus

  }
};
const getDashboardStats = async ({ dateFilter, timezone }) => {
  // ✅ Parallel stats fetch
  const [users, events, ticketsSold, averageTicketPrice, averageRevenuePerUser] = await Promise.all([
    dashboardRepo.getUserStats({ dateFilter, timezone }),
    dashboardRepo.getEventStats({ dateFilter, timezone }),
    dashboardRepo.getTicketsSoldStats({ dateFilter, timezone }),
    dashboardRepo.getAverageTicketPriceStats({ dateFilter, timezone }),
    dashboardRepo.getAverageRevenuePerUserStats({ dateFilter, timezone }),
  ]);


  return {
    stats: [
      // ---------------- USERS ----------------
      {
        key: "totalUsers",
        title: DASHBOARD_KEYS.totalUsers.title,
        value: users.totalUsersCurrent || 0,
        growth: calculateGrowth(
          users.totalUsersCurrent,
          users.totalUsersPrevious
        ),
        ...withSubFilters("totalUsers"),
      },
      {
        key: "totalOrganizers",
        title: DASHBOARD_KEYS.totalOrganizers.title,
        value: users.organizersCurrent || 0,
        growth: calculateGrowth(
          users.organizersCurrent,
          users.organizersPrevious
        ),
        ...withSubFilters("totalOrganizers"),
      },
      {
        key: "activeUsers",
        title: DASHBOARD_KEYS.activeUsers.title,
        value: users.activeUsersCurrent || 0,
        growth: calculateGrowth(
          users.activeUsersCurrent,
          users.activeUsersPrevious
        ),
        ...withSubFilters("activeUsers"),
      },

      // ---------------- EVENTS ----------------
      {
        key: "totalEvents",
        title: DASHBOARD_KEYS.totalEvents.title,
        value: events.totalEventsCurrent || 0,
        growth: calculateGrowth(
          events.totalEventsCurrent,
          events.totalEventsPrevious
        ),
        ...withSubFilters("totalEvents"),
      },
      {
        key: "activeEvents",
        title: DASHBOARD_KEYS.activeEvents.title,
        value: events.activeEventsCurrent || 0,
        growth: calculateGrowth(
          events.activeEventsCurrent,
          events.activeEventsPrevious
        ),
        ...withSubFilters("activeEvents"),
      },

      // ---------------- TICKETS SOLD ----------------
      {
        key: "ticketsSold",
        title: DASHBOARD_KEYS.ticketsSold.title,
        value: ticketsSold.ticketsSoldCurrent || 0,
        growth: calculateGrowth(
          ticketsSold.ticketsSoldCurrent,
          ticketsSold.ticketsSoldPrevious
        ),
        ...withSubFilters("ticketsSold"),
      },

      // ---------------- AVERAGE TICKET PRICE ----------------
      {
        key: "averageTicketPrice",
        title: DASHBOARD_KEYS.averageTicketPrice.title,
        value: averageTicketPrice.current || 0,
        growth: calculateGrowth(
          averageTicketPrice.current,
          averageTicketPrice.previous
        ),
        ...withSubFilters("averageTicketPrice"),
      },

      {
        key: "totalMobilePayments",
        title: DASHBOARD_KEYS.totalMobilePayments.title,
        value: totalMobilePayments.totalPaymentsCurrent || 0,
        growth: calculateGrowth(
          totalMobilePayments.totalPaymentsCurrent,
          totalMobilePayments.totalPaymentsPrevious
        ),
        ...withSubFilters("totalMobilePayments"),
      },
      {
        key: "totalSalesTrends",
        title: "Total Sales Trends",
        value: null,
      }

    ],
  }
};

/**
 * SINGLE DASHBOARD VALUE (used when sub-filter changes)
 */
// const getDashboardValue = async ({
//   key,
//   subFilter,
//   dateFilter,
//   timezone,
// }) => {
//   const ranges = getDateRanges({ dateFilter, timezone });
//   const match = buildMatchByKey({ key, subFilter });

//   let current = 0;
//   let previous = 0;

//   // ✅ USER BASED METRICS
//   if (
//     ["totalUsers", "totalOrganizers", "activeUsers"].includes(key)
//   ) {
//     [current, previous] = await Promise.all([
//       dashboardRepo.getUserSingleMetric({
//         match,
//         range: ranges
//           ? { start: ranges.start, end: ranges.end }
//           : null,
//       }),
//       ranges
//         ? dashboardRepo.getUserSingleMetric({
//           match,
//           range: {
//             start: ranges.prevStart,
//             end: ranges.prevEnd,
//           },
//         })
//         : Promise.resolve(0),
//     ]);
//   }

//   // ✅ EVENT BASED METRICS
//   if (["totalEvents", "activeEvents"].includes(key)) {
//     [current, previous] = await Promise.all([
//       dashboardRepo.getEventSingleMetric({
//         match,
//         range: ranges
//           ? { start: ranges.start, end: ranges.end }
//           : null,
//       }),
//       ranges
//         ? dashboardRepo.getEventSingleMetric({
//           match,
//           range: {
//             start: ranges.prevStart,
//             end: ranges.prevEnd,
//           },
//         })
//         : Promise.resolve(0),
//     ]);
//   }

//   // ✅ TICKET BASED METRICS
//   if (key === "ticketsSold") {
//     [current, previous] = await Promise.all([
//       dashboardRepo.getTicketSingleMetric({
//         match,
//         range: ranges
//           ? { start: ranges.start, end: ranges.end }
//           : null,
//       }),
//       ranges
//         ? dashboardRepo.getTicketSingleMetric({
//           match,
//           range: {
//             start: ranges.prevStart,
//             end: ranges.prevEnd,
//           },
//         })
//         : Promise.resolve(0),
//     ]);
//   }

//   return {
//     key,
//     value: current,
//     growth: calculateGrowth(current, previous),
//   };
// };




const getGlobalWalletSpendingByGenderOverTimeRaw = async (year = new Date().getFullYear()) => {
  let users = await dashboardRepo.getGlobalWalletSpendingByGenderOverTimeRaw(year);
  return buildGlobalLoyaltySpendingByGender(users);

};
const getUsersDashboardAnalytics = async (clubmembersUserIds, year = new Date().getFullYear()) => {
  let users = await dashboardRepo.getUsersForDashboardAnalytics(clubmembersUserIds, year);
  return buildUserDashboardAnalytics(users);
};
const getNewUsersDashboardAnalytics = async (clubmembersUserIds, year = new Date().getFullYear()) => {
  let users = await dashboardRepo.getNewUsersForDashboardAnalytics(clubmembersUserIds, year);
  return buildNewUsersDashboardAnalytics(users);
};
const getUserStatusAnalytics = async (allActiveUsersCurrent, allInactiveUsersCurrent) => {
  return buildUserStatusAnalytics( allActiveUsersCurrent, allInactiveUsersCurrent);
};











const getGlobalWalletPointsOverTimeRaw = async (companyOrganizer) => {
  const rows = await dashboardRepo.getGlobalWalletPointsOverTimeRaw(companyOrganizer);
  return buildGlobalLoyaltyPointsOverTime(rows);
}
const getGlobalWalletSpendingOverTimeRaw = async (companyOrganizer) => {
  const rows = await dashboardRepo.getGlobalWalletSpendingOverTimeRaw(companyOrganizer);
  return buildGlobalLoyaltySpendingOverTime(rows);
}
const getRawGlobalLoyaltyPointsDistributed = async () => {
  const rows = await dashboardRepo.getRawGlobalLoyaltyPointsDistributed();
  return buildGlobalLoyaltyPointsPertWalletType(rows);
};

const getUsersPerGlobalLevel = async () => {
  const rows = await dashboardRepo.getUsersPerGlobalLevel();
  return buildGlobalLevelAnalytics(rows);
};
const getGlobalRewardsUsageStats = async () => {
  const rows = await dashboardRepo.getGlobalRewardsUsageStats();
  return buildGlobalLoyaltyProducts(rows);
};


module.exports = {
  getDashboard,
  // getDashboardValue,
  getDashboardStats,
};
