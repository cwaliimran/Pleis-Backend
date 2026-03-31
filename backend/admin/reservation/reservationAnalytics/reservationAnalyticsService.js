const ReservationAnalyticsRepo = require("./reservationAnalyticsRepository");
const { calculateGrowth } = require("./utils/reservationAnalyticsDate.utils");
const { ReservationAnalytics_KEYS, withSubFilters } = require("./utils/reservationAnalyticsKeyMap");
const { buildUserStatusAnalytics } = require("./utils/buildUserStatusAnalytics");
const { buildReservationsOverTime } = require("./utils/buildReservationsOverTime");
const { buildGlobalLoyaltyPointsPertWalletType } = require("./utils/buildGlobalLoyaltyPointsPertWalletType ");
const { buildRevenueOverTime } = require("./utils/buildRevenueOverTime");
const { buildReservationsByHour } = require("./utils/buildReservationsByHour");

/**
 * ReservationAnalytics – Load all cards at once
 */
const getReservationAnalytics = async ({ dateFilter, timezone, companyOrganizer }) => {
  const promises = [
    ReservationAnalyticsRepo.getReservationsStats({ dateFilter, timezone, companyOrganizer }),
    getReservationsOverTimeRaw(companyOrganizer
    ),
    getRevenueOverTimeRaw(companyOrganizer),
    ReservationAnalyticsRepo.getReservationTypeStatsRaw(companyOrganizer),
    getReservationsByHourRaw(companyOrganizer),
    ReservationAnalyticsRepo.getUserLevelStatsRaw(companyOrganizer),
  ];
  const [
    reservations, // used
    reservationsOverTime,// used
    revenueOverTime, // used
    reservationTypes,
    reservationsByHour,
    userLevelStats, // used
  ] = await Promise.all(promises);
  return {
    stats: [
      // ---------------- USERS ----------------
      {    // used 
        key: "totalReservations",
        title: ReservationAnalytics_KEYS.totalReservations.title,
        value: reservations.totalReservations || 0,
        ...withSubFilters("totalReservations"),
      },
      {
        key: "expiredReservations",  // used 
        title: ReservationAnalytics_KEYS.expiredReservations.title,
        value: reservations.expiredReservations || 0,

        ...withSubFilters("expiredReservations"),
      },
      {
        key: "totalCapacity",  // used 
        title: ReservationAnalytics_KEYS.totalCapacity.title,
        value: reservations.totalCapacity || 0,

        ...withSubFilters("totalCapacity"),
      },
      {
        key: "totalConfirmedReservations",  // used 
        title: ReservationAnalytics_KEYS.totalConfirmedReservations.title,
        value: reservations.totalConfirmedReservations || 0,
        ...withSubFilters("totalConfirmedReservations"),
      },
            {
        key: "totalRevenue",  // used 
        title: ReservationAnalytics_KEYS.totalRevenue.title,
        value: reservations.totalRevenue || 0,
        ...withSubFilters("totalRevenue"),
      },
                  {
        key: "totalPrepayReservations",  // used 
        title: ReservationAnalytics_KEYS.totalPrepayReservations.title,
        value: reservations.totalPrepayReservations || 0,
        ...withSubFilters("totalPrepayReservations"),
      },
      {
        key: "averageGroupSize",  // used
        title: ReservationAnalytics_KEYS.averageGroupSize.title,
        value: reservations.averageGroupSize || 0,
        ...withSubFilters("averageGroupSize"),
      },
      {
        key: "totalCapacityReserved",  // used
        title: ReservationAnalytics_KEYS.totalCapacityReserved.title,
        value: reservations.totalCapacityReserved || 0,
        ...withSubFilters("totalCapacityReserved"),
      },
      {
        key: "averageReservationValue",  // used
        title: ReservationAnalytics_KEYS.averageReservationValue.title,
        value: reservations.averageReservationValue || 0,
        ...withSubFilters("averageReservationValue"),
      },
      {
        key: "reservationConversionRate",  // used
        title: ReservationAnalytics_KEYS.reservationConversionRate.title,
        value: reservations.reservationConversionRate || 0,
        ...withSubFilters("reservationConversionRate"),
      },
      {
        key: "pendingReservations",  // used
        title: ReservationAnalytics_KEYS.pendingReservations.title,
        value: reservations.pendingReservations || 0,
        ...withSubFilters("pendingReservations"),
      },
      {
        key: "remainingCapacity",  // used
        title: ReservationAnalytics_KEYS.remainingCapacity.title,
        value: reservations.remainingCapacity || 0,
        ...withSubFilters("remainingCapacity"),
      }
    ].filter(Boolean),
    reservationsOverTime,
    revenueOverTime,
    reservationTypes,
    reservationsByHour,
    userLevelStats,
  }
};
const getReservationAnalyticsStats = async ({ dateFilter, timezone }) => {
  const [users, events, ticketsSold, averageTicketPrice, averageRevenuePerUser] = await Promise.all([
    ReservationAnalyticsRepo.getUserStats({ dateFilter, timezone }),
    ReservationAnalyticsRepo.getEventStats({ dateFilter, timezone }),
    ReservationAnalyticsRepo.getTicketsSoldStats({ dateFilter, timezone }),
    ReservationAnalyticsRepo.getAverageTicketPriceStats({ dateFilter, timezone }),
    ReservationAnalyticsRepo.getAverageRevenuePerUserStats({ dateFilter, timezone }),
  ]);


  return {
    stats: [
      // ---------------- USERS ----------------
      {
        key: "totalUsers",
        title: ReservationAnalytics_KEYS.totalUsers.title,
        value: users.totalUsersCurrent || 0,
        growth: calculateGrowth(
          users.totalUsersCurrent,
          users.totalUsersPrevious
        ),
        ...withSubFilters("totalUsers"),
      },
      {
        key: "totalOrganizers",
        title: ReservationAnalytics_KEYS.totalOrganizers.title,
        value: users.organizersCurrent || 0,
        growth: calculateGrowth(
          users.organizersCurrent,
          users.organizersPrevious
        ),
        ...withSubFilters("totalOrganizers"),
      },
      {
        key: "activeUsers",
        title: ReservationAnalytics_KEYS.activeUsers.title,
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
        title: ReservationAnalytics_KEYS.totalEvents.title,
        value: events.totalEventsCurrent || 0,
        growth: calculateGrowth(
          events.totalEventsCurrent,
          events.totalEventsPrevious
        ),
        ...withSubFilters("totalEvents"),
      },
      {
        key: "activeEvents",
        title: ReservationAnalytics_KEYS.activeEvents.title,
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
        title: ReservationAnalytics_KEYS.ticketsSold.title,
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
        title: ReservationAnalytics_KEYS.averageTicketPrice.title,
        value: averageTicketPrice.current || 0,
        growth: calculateGrowth(
          averageTicketPrice.current,
          averageTicketPrice.previous
        ),
        ...withSubFilters("averageTicketPrice"),
      },

      {
        key: "totalMobilePayments",
        title: ReservationAnalytics_KEYS.totalMobilePayments.title,
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
 * SINGLE ReservationAnalytics VALUE (used when sub-filter changes)
 */
// const getReservationAnalyticsValue = async ({
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
//       ReservationAnalyticsRepo.getUserSingleMetric({
//         match,
//         range: ranges
//           ? { start: ranges.start, end: ranges.end }
//           : null,
//       }),
//       ranges
//         ? ReservationAnalyticsRepo.getUserSingleMetric({
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
//       ReservationAnalyticsRepo.getEventSingleMetric({
//         match,
//         range: ranges
//           ? { start: ranges.start, end: ranges.end }
//           : null,
//       }),
//       ranges
//         ? ReservationAnalyticsRepo.getEventSingleMetric({
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
//       ReservationAnalyticsRepo.getTicketSingleMetric({
//         match,
//         range: ranges
//           ? { start: ranges.start, end: ranges.end }
//           : null,
//       }),
//       ranges
//         ? ReservationAnalyticsRepo.getTicketSingleMetric({
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
  const rows = await ReservationAnalyticsRepo.getGlobalWalletPointsOverTimeRaw(companyOrganizer);
  return buildGlobalLoyaltyPointsOverTime(rows);
}
const getRevenueOverTimeRaw = async (companyOrganizer) => {
  const rows = await ReservationAnalyticsRepo.getRevenueOverTimeRaw(companyOrganizer);
  return buildRevenueOverTime(rows);
}

const getReservationsOverTimeRaw = async (companyOrganizer) => {
  const rows = await ReservationAnalyticsRepo.getReservationsOverTimeRaw(companyOrganizer);
  return buildReservationsOverTime(rows);
};
const getReservationsByHourRaw = async (companyOrganizer) => {
  const rows = await ReservationAnalyticsRepo.getReservationsByHourRaw(companyOrganizer);
  return buildReservationsByHour(rows);
};
  const getReservationTransactions = async ({ page, limit, timezone, companyOrganizer }) => {
    const {data, meta} = await ReservationAnalyticsRepo.getUserReservationPaymentsQA({ page, limit, timezone, companyOrganizer });
    return { data, meta };
  };
    const getReservationChnageLogs = async ({ page, limit, timezone, companyOrganizer }) => {
    const {data, meta} = await ReservationAnalyticsRepo.getUserReservationChangeLogs({ page, limit, companyOrganizer });
    return { data, meta };
  };

module.exports = {
  getReservationAnalytics,
  // getReservationAnalyticsValue,
  getReservationAnalyticsStats,
  getReservationTransactions,
  getReservationChnageLogs
};
