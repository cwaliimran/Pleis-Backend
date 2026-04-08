const AnalyticsRepo = require("./analyticsRepository");
const { calculateGrowth } = require("./utils/analyticsDate.utils");
const { Analytics_KEYS, withSubFilters } = require("./utils/analyticsKeyMap");
const { buildUserStatusAnalytics } = require("./utils/buildUserStatusAnalytics");
const {buildByOverTime } = require("./utils/buildReservationsOverTime");
const { buildSpendOverTime } = require("./utils/buildSpendOverTime");
const { buildReferralsOverTime } = require("./utils/buildReferralsOverTime");

/**
 * Analytics – Load all cards at once
 */
const getAnalytics = async ({ dateFilter, timezone, user, companyOrganizer }) => {
  const promises = [
    AnalyticsRepo.getClubMembersWithDetails(companyOrganizer, dateFilter, timezone, user), // used
    getByTimeRaw(companyOrganizer, user), // used
    getSpendingOverByTimeRaw(companyOrganizer, user), // used
    getReferralsOverTime(companyOrganizer, user), // used
    AnalyticsRepo.getOrderTypeStats(companyOrganizer, user), // used
  ];
  const [
    stats,
    pointsOverTime,
    spendingOverTime,
    referralsOverTime,
    purchaseCategoryDistribution,

  ] = await Promise.all(promises);
  return {
    stats,
    pointsOverTime,
    spendingOverTime,
    referralsOverTime,
    purchaseCategoryDistribution,

  }
};
const getAnalyticsStats = async ({ dateFilter, timezone }) => {
  const [users, events, ticketsSold, averageTicketPrice, averageRevenuePerUser] = await Promise.all([
    AnalyticsRepo.getUserStats({ dateFilter, timezone }),
    AnalyticsRepo.getEventStats({ dateFilter, timezone }),
    AnalyticsRepo.getTicketsSoldStats({ dateFilter, timezone }),
    AnalyticsRepo.getAverageTicketPriceStats({ dateFilter, timezone }),
    AnalyticsRepo.getAverageRevenuePerUserStats({ dateFilter, timezone }),
  ]);


  return {
    stats: [
      // ---------------- USERS ----------------
      {
        key: "totalUsers",
        title: Analytics_KEYS.totalUsers.title,
        value: users.totalUsersCurrent || 0,
        growth: calculateGrowth(
          users.totalUsersCurrent,
          users.totalUsersPrevious
        ),
        ...withSubFilters("totalUsers"),
      },
      {
        key: "totalOrganizers",
        title: Analytics_KEYS.totalOrganizers.title,
        value: users.organizersCurrent || 0,
        growth: calculateGrowth(
          users.organizersCurrent,
          users.organizersPrevious
        ),
        ...withSubFilters("totalOrganizers"),
      },
      {
        key: "activeUsers",
        title: Analytics_KEYS.activeUsers.title,
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
        title: Analytics_KEYS.totalEvents.title,
        value: events.totalEventsCurrent || 0,
        growth: calculateGrowth(
          events.totalEventsCurrent,
          events.totalEventsPrevious
        ),
        ...withSubFilters("totalEvents"),
      },
      {
        key: "activeEvents",
        title: Analytics_KEYS.activeEvents.title,
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
        title: Analytics_KEYS.ticketsSold.title,
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
        title: Analytics_KEYS.averageTicketPrice.title,
        value: averageTicketPrice.current || 0,
        growth: calculateGrowth(
          averageTicketPrice.current,
          averageTicketPrice.previous
        ),
        ...withSubFilters("averageTicketPrice"),
      },

      {
        key: "totalMobilePayments",
        title: Analytics_KEYS.totalMobilePayments.title,
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


const getUserStatusAnalytics = async (allActiveUsersCurrent, allInactiveUsersCurrent) => {
  return buildUserStatusAnalytics(allActiveUsersCurrent, allInactiveUsersCurrent);
};

const getGlobalWalletPointsOverTimeRaw = async (companyOrganizer) => {
  const rows = await AnalyticsRepo.getGlobalWalletPointsOverTimeRaw(companyOrganizer);
  return buildGlobalLoyaltyPointsOverTime(rows);
}

const getByTimeRaw = async (companyOrganizer, user) => {
  const rows = await AnalyticsRepo.getByTimeRaw(companyOrganizer, user);

  return buildByOverTime(rows);
};
const getSpendingOverByTimeRaw = async (companyOrganizer, user) => {
  const rows = await AnalyticsRepo.getSpendingOverByTimeRaw(companyOrganizer, user);

  return buildSpendOverTime(rows);
};



const getTransactions = async ({ page, limit, timezone, companyOrganizer, organizations, user }) => {
  const { data, meta } = await AnalyticsRepo.getTopMenuOrdersFromWallet({ page, limit, timezone, companyOrganizer, organizations,  user });
  return { data, meta };
};
const getsummary = async ({ page, limit, timezone, companyOrganizer, user }) => {
  const data = await AnalyticsRepo.getAnalyticsValue({ page, limit, companyOrganizer, user });
  return data;
};















const getReferralsOverTime = async (companyOrganizer, user) => {
  const rows = await AnalyticsRepo.getReferralsOverTime(companyOrganizer, user);
  return buildReferralsOverTime(rows);
};

module.exports = {
  getAnalytics,
  getAnalyticsStats,
  getTransactions,
  getsummary,
};
