const AnalyticsRepo = require("./analyticsRepository");
const { calculateGrowth } = require("./utils/analyticsDate.utils");
const { Analytics_KEYS, withSubFilters } = require("./utils/analyticsKeyMap");
const { buildUserStatusAnalytics } = require("./utils/buildUserStatusAnalytics");
const { buildReservationsOverTime } = require("./utils/buildReservationsOverTime");
const { buildGlobalLoyaltyPointsPertWalletType } = require("./utils/buildGlobalLoyaltyPointsPertWalletType ");
const { buildRevenueOverTime } = require("./utils/buildRevenueOverTime");
const { buildReservationsByHour } = require("./utils/buildReservationsByHour");
const { getOrganizationIdsByCompanyOrganizer } = require("../../../admin/organizations/organizationRepository");

/**
 * Analytics – Load all cards at once
 */
const getAnalytics = async ({ dateFilter, timezone, companyOrganizer, organizations }) => {
  if(companyOrganizer){
   organizations = await getOrganizationIdsByCompanyOrganizer(companyOrganizer);
  }
  const promises = [
    AnalyticsRepo.orderStatsRaw({ dateFilter, timezone, organizations }),
    getReservationsOverTimeRaw(organizations),
    getRevenueOverTimeRaw(organizations),
    AnalyticsRepo.getMostOrderedCategoryData(organizations),
    getReservationsByHourRaw(organizations),
    AnalyticsRepo.getUserLevelStatsRaw(organizations),
    getAverageOrderValueOverTimeRaw(organizations)

  ];

  const [
    orderStats, // used
    reservationsOverTime,// used
    revenueOverTime, // used
    orderedCategories,
    reservationsByHour,
    userLevelStats, // used
    averageOrderValueOverTime, // used
  ] = await Promise.all(promises);

  return {
    stats: [
      {    // used 
        key: "totalOrders",
        title: Analytics_KEYS.totalOrders.title,
        value: orderStats.totalOrdersCurrent || 0,
        growth: calculateGrowth(
          orderStats.totalOrdersCurrent,
          orderStats.totalOrdersPrevious
        ),
        ...withSubFilters("totalOrders"),
      },
      {    // used 
        key: "totalRevenue",
        title: Analytics_KEYS.totalRevenue.title,
        value: orderStats.totalRevenueCurrent || 0,
        growth: calculateGrowth(
          orderStats.totalRevenueCurrent,
          orderStats.totalRevenuePrevious
        ),
        ...withSubFilters("totalRevenue"),
      },
      // ---------------- USERS ----------------
      {    // used 
        key: "revenueAfterCommission",
        title: Analytics_KEYS.revenueAfterCommission.title,
        value: orderStats.revenueAfterCommission || 0,
        ...withSubFilters("revenueAfterCommission"),
      },
      {
        key: "averageOrderValue",  // used 
        title: Analytics_KEYS.averageOrderValue.title,
        value: orderStats.averageOrderValue || 0,

        ...withSubFilters("averageOrderValue"),
      },
      {
        key: "orderFrequencyPerHour",  // used 
        title: Analytics_KEYS.orderFrequencyPerHour.title,
        value: orderStats.orderFrequencyPerHour || 0,

        ...withSubFilters("orderFrequencyPerHour"),
      },
      {
        key: "mostOrderedCategory",  // used 
        title: Analytics_KEYS.mostOrderedCategory.title,
        value: orderStats.mostOrderedCategory || 0,
        ...withSubFilters("mostOrderedCategory"),
      },
      {
        key: "totalItemsSold",  // used 
        title: Analytics_KEYS.totalItemsSold.title,
        value: orderStats.totalItemsSold || 0,
        ...withSubFilters("totalItemsSold"),
      },
      {
        key: "totalLimitedTimeItems",  // used 
        title: Analytics_KEYS.totalLimitedTimeItems.title,
        value: orderStats.totalLimitedTimeItems || 0,
        ...withSubFilters("totalLimitedTimeItems"),
      },

    ].filter(Boolean),
    ordersOverTime:reservationsOverTime,
    revenueOverTime,
    orderedCategories,
    orderByHour:reservationsByHour,
    salesSourceBreakDown:userLevelStats,
    averageOrderValueOverTime,  
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
const getRevenueOverTimeRaw = async (organizations) => {
  const rows = await AnalyticsRepo.getRevenueOverTimeRaw(organizations);

  return buildRevenueOverTime(rows);
}

const getReservationsOverTimeRaw = async (organizations) => {
  const rows = await AnalyticsRepo.getReservationsOverTimeRaw(organizations);
  return buildReservationsOverTime(rows);
};
const getAverageOrderValueOverTimeRaw = async (organizations) => {
  const rows = await AnalyticsRepo.getAverageOrderValueOverTimeRaw(organizations);
  return buildReservationsOverTime(rows);
};

const getReservationsByHourRaw = async (organizations) => {
  const rows = await AnalyticsRepo.getReservationsByHourRaw(organizations);
  return buildReservationsByHour(rows);
};
const getReservationTransactions = async ({ page, limit, timezone, companyOrganizer, organizations }) => {
    if(companyOrganizer){
   organizations = await getOrganizationIdsByCompanyOrganizer(companyOrganizer);
  }
  const { data, meta } = await AnalyticsRepo.getUserReservationPaymentsQA({ page, limit, timezone, organizations });
  return { data, meta };
};
const getReservationChnageLogs = async ({ page, limit, timezone, companyOrganizer, organizations }) => {
    if(companyOrganizer){
   organizations = await getOrganizationIdsByCompanyOrganizer(companyOrganizer);
  }
  const { data, meta } = await AnalyticsRepo.getUserReservationChangeLogs({ page, limit, timezone, organizations });
  return { data, meta };
};
const getMenuItemSalesData = async ({ page, limit, timezone, companyOrganizer }) => {
  let organizations=undefined;
    if(companyOrganizer){
   organizations = await getOrganizationIdsByCompanyOrganizer(companyOrganizer);
  }
  const { data, meta } = await AnalyticsRepo.getMenuItemSalesData({ page, limit, organizations });
  return { data, meta };
};

module.exports = {
  getAnalytics,
  // getAnalyticsValue,
  getAnalyticsStats,
  getReservationTransactions,
  getReservationChnageLogs,
  getMenuItemSalesData
};
