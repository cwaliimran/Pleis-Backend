const AnalyticsRepo = require("./analyticsRepository");
const { calculateGrowth } = require("./utils/AnalyticsDate.utils");
const { Analytics_KEYS, withSubFilters } = require("./utils/AnalyticsKeyMap");
const { buildUserStatusAnalytics } = require("./utils/buildUserStatusAnalytics");
const { buildReservationsOverTime, buildByOverTime } = require("./utils/buildReservationsOverTime");
const { buildGlobalLoyaltyPointsPertWalletType } = require("./utils/buildGlobalLoyaltyPointsPertWalletType ");
const { buildRevenueOverTime } = require("./utils/buildRevenueOverTime");
const { buildReservationsByHour } = require("./utils/buildReservationsByHour");
const { getUserIdsForOrganization, getUserIdsForOrganizationOrganizaerView } = require("@appEngagement/engagementEventsRepository");
const { buildEventByOverTime } = require("./utils/buildEventOverTime");
const { buildUserDashboardAnalytics } = require("./utils/buildUsersDashboardAnalytics");
const { buildInterestPerCategory } = require("./utils/buildInterestPerCategory");
const { buildOrganizationViewOverTime } = require("./utils/buildOrganizationViewOverTime");
const { buildInterestPerTags } = require("./utils/buildInterestPerTags");
const { buildRepeatPurcharersOverTime } = require("./utils/buildRepeatPurcharersOverTime");
const { buildStreaksOverTime } = require("./utils/buildStreaksOverTime");

/**
 * Analytics – Load all cards at once
 */
const getAnalytics = async ({ dateFilter, timezone, companyOrganizer, organization }) => {
  const users = await getUserIdsForOrganizationOrganizaerView(organization);
  const promises = [
    getByTimeRaw( organization, dateFilter, timezone), // used
    // getEventByTimeRaw(users, organization, dateFilter, timezone), // used
    getViews( organization, dateFilter, timezone), // used
    getRawInterestDataByOrganizer(users),
    getRawTagsDataByOrganizer(users),
    geViewsByTimeRaw( organization, dateFilter, timezone),
    getRepeatPurchasesByTimeRaw(organization, dateFilter, timezone),
    getUserStreaksByTimeRaw( organization, dateFilter, timezone),
    // getRevenueOverTimeRaw(companyOrganizer,organization),
    // AnalyticsRepo.getReservationTypeStatsRaw(companyOrganizer, organization),
    // getReservationsByHourRaw(companyOrganizer, organization),
    // AnalyticsRepo.getUserLevelStatsRaw(companyOrganizer, organization),
  ];
  const [
    salesOverTime,// used
    // eventOverTime, // used
    viewerShipTrends, // used
    interestPerCategory,
    interestPerTag,
    viewsByTime,
    repeatPurchasesByTime,
    userStreaksByTime,
    // revenueOverTime, // used
    // reservationTypes,
    // reservationsByHour,
    // userLevelStats, // used
  ] = await Promise.all(promises);
  return {
    salesOverTime,
    // eventOverTime,
    viewerShipTrends,
    interestPerCategory: interestPerCategory.interestPerCategory,
    interestPerTag: interestPerTag.interestPerTag,

    viewsByTime,
    repeatPurchasesByTime,
    userStreaksByTime,
    // revenueOverTime,
    // reservationTypes,
    // reservationsByHour,
    // userLevelStats,
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

/**
 * SINGLE Analytics VALUE (used when sub-filter changes)
 */
// const getAnalyticsValue = async ({
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
//       AnalyticsRepo.getUserSingleMetric({
//         match,
//         range: ranges
//           ? { start: ranges.start, end: ranges.end }
//           : null,
//       }),
//       ranges
//         ? AnalyticsRepo.getUserSingleMetric({
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
//       AnalyticsRepo.getEventSingleMetric({
//         match,
//         range: ranges
//           ? { start: ranges.start, end: ranges.end }
//           : null,
//       }),
//       ranges
//         ? AnalyticsRepo.getEventSingleMetric({
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
//       AnalyticsRepo.getTicketSingleMetric({
//         match,
//         range: ranges
//           ? { start: ranges.start, end: ranges.end }
//           : null,
//       }),
//       ranges
//         ? AnalyticsRepo.getTicketSingleMetric({
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





const getUserStatusAnalytics = async (allActiveUsersCurrent, allInactiveUsersCurrent) => {
  return buildUserStatusAnalytics(allActiveUsersCurrent, allInactiveUsersCurrent);
};











const getGlobalWalletPointsOverTimeRaw = async (companyOrganizer) => {
  const rows = await AnalyticsRepo.getGlobalWalletPointsOverTimeRaw(companyOrganizer);
  return buildGlobalLoyaltyPointsOverTime(rows);
}
const getRevenueOverTimeRaw = async (companyOrganizer, organizations) => {
  const rows = await AnalyticsRepo.getRevenueOverTimeRaw(companyOrganizer, organizations);
  return buildRevenueOverTime(rows);
}

const getByTimeRaw = async ( organization, dateFilter, timezone) => {
  const rows = await AnalyticsRepo.getByTimeRaw( organization, dateFilter, timezone);

  return buildByOverTime(rows);
};
const getEventByTimeRaw = async (users, organization, dateFilter, timezone) => {
  const rows = await AnalyticsRepo.getEventByTimeRaw(users, organization, dateFilter, timezone);
  return buildEventByOverTime(rows);
};

const getReservationsByHourRaw = async (users) => {
  const rows = await AnalyticsRepo.getReservationsByHourRaw(users);
  return buildReservationsByHour(rows);
};
const getReservationTransactions = async ({ page, limit, timezone, companyOrganizer, organizations }) => {
  const { data, meta } = await AnalyticsRepo.getUserReservationPaymentsQA({ page, limit, timezone, companyOrganizer, organizations });
  return { data, meta };
};
const getReservationChnageLogs = async ({ page, limit, timezone, companyOrganizer, organizations }) => {
  const { data, meta } = await AnalyticsRepo.getUserReservationChangeLogs({ page, limit, companyOrganizer, organizations });
  return { data, meta };
};







const getViews = async (organization, dateFilter, timezone) => {
  const rows = await AnalyticsRepo.getViews( organization, dateFilter, timezone);
  return buildUserDashboardAnalytics(rows);
};


const getRawInterestDataByOrganizer = async (users) => {
  const rows = await AnalyticsRepo.getRawInterestDataByOrganizer(users);

  return buildInterestPerCategory(rows);
};
const geViewsByTimeRaw = async ( organization, dateFilter, timezone) => {
  const rows = await AnalyticsRepo.geViewsByTimeRaw( organization, dateFilter, timezone);
  return buildOrganizationViewOverTime(rows);
};

const getRawTagsDataByOrganizer = async (users) => {

  const rows = await AnalyticsRepo.getRawTagsDataByOrganizer(users);

  return buildInterestPerTags(rows);
};
const getRepeatPurchasesByTimeRaw = async ( organization, dateFilter, timezone) => {
  const rows = await AnalyticsRepo.getRepeatPurchasesByTimeRaw( organization, dateFilter, timezone);

  return buildRepeatPurcharersOverTime(rows);
};

const getUserStreaksByTimeRaw = async ( organization, dateFilter, timezone) => {
  const rows = await AnalyticsRepo.getUserStreaksByTimeRaw( organization, dateFilter, timezone);
  console.log("rows",rows );
  return buildStreaksOverTime(rows);
};


module.exports = {
  getAnalytics,
  // getAnalyticsValue,
  getAnalyticsStats,
  getReservationTransactions,
  getReservationChnageLogs
};
