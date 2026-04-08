const ReferralAnalyticsRepo = require("./referralAnalyticsRepository");
const { calculateGrowth } = require("./utils/referralAnalyticsDate.utils");
const { ReferralAnalytics_KEYS, withSubFilters } = require("./utils/referralAnalyticsKeyMap");
const { buildUserStatusAnalytics } = require("./utils/buildUserStatusAnalytics");
const { buildGlobalLoyaltyPointsOverTime } = require("./utils/buildGlobalLoyaltyPointsOverTime");
const { buildGlobalLoyaltyPointsPertWalletType } = require("./utils/buildGlobalLoyaltyPointsPertWalletType ");

/**
 * ReferralAnalytics – Load all cards at once
 */
const getReferralAnalytics = async ({ dateFilter, timezone, companyOrganizer }) => {
  const promises = [
    ReferralAnalyticsRepo.getUserStats({ dateFilter, timezone, companyOrganizer }),
    getReferralsOverTimeRaw(companyOrganizer
    ),
    ReferralAnalyticsRepo.getTopReferrers(companyOrganizer),
    ReferralAnalyticsRepo.getGlobalReferralSettings(companyOrganizer
    ),

  ];

  const [
    users, // used
    referralsOverTime,// used
    topReferrers, // used
    referralSettings, // used
  ] = await Promise.all(promises);
  return {
    stats: [
      // ---------------- USERS ----------------
      {    // used 
        key: "totalReferralsCompleted",
        title: ReferralAnalytics_KEYS.totalReferralsCompleted.title,
        value: users.totalReferralsCompleted || 0,
        ...withSubFilters("totalReferralsCompleted"),
      },
      {
        key: "totalPointsGiven",  // used 
        title: ReferralAnalytics_KEYS.totalPointsGiven.title,
        value: users.totalPointsGiven || 0,

        ...withSubFilters("totalPointsGiven"),
      },
      {
        key: "referrerPoints",  // used 
        title: ReferralAnalytics_KEYS.referrerPoints.title,
        value: users.referralConfig.referrerPoints || 0,

        ...withSubFilters("referrerPoints"),
      },
      {
        key: "status",  // used 
        title: ReferralAnalytics_KEYS.status.title,
        value: users.referralConfig.status || "deleted",
        ...withSubFilters("status"),
      },

    ].filter(Boolean),
    referralsOverTime,
    topReferrers,
    referralSettings,
  }
};
const getReferralAnalyticsStats = async ({ dateFilter, timezone }) => {
  // ✅ Parallel stats fetch
  const [users, events, ticketsSold, averageTicketPrice, averageRevenuePerUser] = await Promise.all([
    ReferralAnalyticsRepo.getUserStats({ dateFilter, timezone }),
    ReferralAnalyticsRepo.getEventStats({ dateFilter, timezone }),
    ReferralAnalyticsRepo.getTicketsSoldStats({ dateFilter, timezone }),
    ReferralAnalyticsRepo.getAverageTicketPriceStats({ dateFilter, timezone }),
    ReferralAnalyticsRepo.getAverageRevenuePerUserStats({ dateFilter, timezone }),
  ]);


  return {
    stats: [
      // ---------------- USERS ----------------
      {
        key: "totalUsers",
        title: ReferralAnalytics_KEYS.totalUsers.title,
        value: users.totalUsersCurrent || 0,
        growth: calculateGrowth(
          users.totalUsersCurrent,
          users.totalUsersPrevious
        ),
        ...withSubFilters("totalUsers"),
      },
      {
        key: "totalOrganizers",
        title: ReferralAnalytics_KEYS.totalOrganizers.title,
        value: users.organizersCurrent || 0,
        growth: calculateGrowth(
          users.organizersCurrent,
          users.organizersPrevious
        ),
        ...withSubFilters("totalOrganizers"),
      },
      {
        key: "activeUsers",
        title: ReferralAnalytics_KEYS.activeUsers.title,
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
        title: ReferralAnalytics_KEYS.totalEvents.title,
        value: events.totalEventsCurrent || 0,
        growth: calculateGrowth(
          events.totalEventsCurrent,
          events.totalEventsPrevious
        ),
        ...withSubFilters("totalEvents"),
      },
      {
        key: "activeEvents",
        title: ReferralAnalytics_KEYS.activeEvents.title,
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
        title: ReferralAnalytics_KEYS.ticketsSold.title,
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
        title: ReferralAnalytics_KEYS.averageTicketPrice.title,
        value: averageTicketPrice.current || 0,
        growth: calculateGrowth(
          averageTicketPrice.current,
          averageTicketPrice.previous
        ),
        ...withSubFilters("averageTicketPrice"),
      },

      {
        key: "totalMobilePayments",
        title: ReferralAnalytics_KEYS.totalMobilePayments.title,
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
 * SINGLE ReferralAnalytics VALUE (used when sub-filter changes)
 */
// const getReferralAnalyticsValue = async ({
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
//       ReferralAnalyticsRepo.getUserSingleMetric({
//         match,
//         range: ranges
//           ? { start: ranges.start, end: ranges.end }
//           : null,
//       }),
//       ranges
//         ? ReferralAnalyticsRepo.getUserSingleMetric({
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
//       ReferralAnalyticsRepo.getEventSingleMetric({
//         match,
//         range: ranges
//           ? { start: ranges.start, end: ranges.end }
//           : null,
//       }),
//       ranges
//         ? ReferralAnalyticsRepo.getEventSingleMetric({
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
//       ReferralAnalyticsRepo.getTicketSingleMetric({
//         match,
//         range: ranges
//           ? { start: ranges.start, end: ranges.end }
//           : null,
//       }),
//       ranges
//         ? ReferralAnalyticsRepo.getTicketSingleMetric({
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
  return buildUserStatusAnalytics( allActiveUsersCurrent, allInactiveUsersCurrent);
};











const getGlobalWalletPointsOverTimeRaw = async (companyOrganizer) => {
  const rows = await ReferralAnalyticsRepo.getGlobalWalletPointsOverTimeRaw(companyOrganizer);
  return buildGlobalLoyaltyPointsOverTime(rows);
}

const getReferralsOverTimeRaw = async (companyOrganizer) => {
  const rows = await ReferralAnalyticsRepo.getReferralsOverTimeRaw(companyOrganizer);

  return buildGlobalLoyaltyPointsOverTime(rows);
};




module.exports = {
  getReferralAnalytics,
  // getReferralAnalyticsValue,
  getReferralAnalyticsStats,
};
