const dashboardRepo = require("./dashboardRepository");
const { calculateGrowth } = require("./utils/dashboardDate.utils");
const { DASHBOARD_KEYS, withSubFilters } = require("./utils/dashboardKeyMap");
const { buildMatchByKey } = require("./utils/dashboardKeyMatch");
const { getDateRanges } = require("./utils/dashboardDate.utils");
const { buildUserDashboardAnalytics } = require("./utils/buildUsersDashboardAnalytics");
const { buildInterestPerCategory } = require("./utils/buildInterestPerCategory");
const { buildSearchVolumeByMonth } = require("./utils/buildSearchVolumeByMonth");
const { buildTopPerformingOrganizers } = require("./utils/buildTopPerformingOrganizers");
const { buildEventsOverTime } = require("./utils/buildEventsOverTime");
const { buildTotalTrend } = require("./utils/buildTotalSalesTrends");
const { buildMostViewedEvents } = require("./utils/buildMostViewedEvents");
const { buildFollowersOverTime } = require("./utils/buildFollowersOverTime");
const { buildTopEvents } = require("./utils/buildTopEvents");

/**
 * DASHBOARD – Load all cards at once
 */
const getDashboard = async ({ dateFilter, timezone, companyOrganizer }) => {
  const promises = [
    dashboardRepo.getUserStats({ dateFilter, timezone, companyOrganizer }),
    dashboardRepo.getEventStats({ dateFilter, timezone, status: "active", companyOrganizer }),
    dashboardRepo.getEventStats({ dateFilter, timezone, companyOrganizer }),
    dashboardRepo.getTicketsSoldStats({ dateFilter, timezone, companyOrganizer }),
    dashboardRepo.getAverageTicketPriceStats({ dateFilter, timezone, companyOrganizer }),
    dashboardRepo.getAverageRevenuePerUserStats({ dateFilter, timezone, companyOrganizer }),
    dashboardRepo.getTotalRevenueStats({ dateFilter, timezone, companyOrganizer }),
    getOrganizerPerformanceComparisonService({ timezone,companyOrganizer }),
    getUsersDashboardAnalytics(),
    getInterestPerCategoryService(companyOrganizer),
    getTopSearchesAnalytics(),
    getTopPerformingOrganizers(),
    getEventsOverTimeService(companyOrganizer),
    getTrends(companyOrganizer),
    dashboardRepo.getTotalMobilePaymentsStats({ dateFilter, timezone }),
  ];
  if (companyOrganizer) {
    promises.push(
      dashboardRepo.getOrganizationsStats({ dateFilter, timezone, companyOrganizer })
    );
  }
  if (companyOrganizer) {
    promises.push(
      dashboardRepo.getClubMembersStats({ dateFilter, timezone, companyOrganizer })
    );
  }
  if (companyOrganizer) {
    promises.push(
      dashboardRepo.getReservationsStats({ dateFilter, timezone, companyOrganizer })
    );
  }
  if (companyOrganizer) {
    promises.push(
      dashboardRepo.getBookedReservationsStats({ dateFilter, timezone, companyOrganizer })

    );
  }
  if (companyOrganizer) {
    promises.push(
      getOrganizerUsersDashboardAnalytics(companyOrganizer)
    );
  }
  if (companyOrganizer) {
    promises.push(
      getTopViewedEvents(companyOrganizer)
    );
  }
  if (companyOrganizer) {
    promises.push(
      getFollowersOverTimeRaw(companyOrganizer)
    );
  }
  if (companyOrganizer) {
    promises.push(
      getRawTopPerformingEvents(companyOrganizer)
    );
  }

  const [
    users,
    activeEvents,
    allEvents,
    ticketsSold,
    averageTicketPrice,
    averageRevenuePerUser,
    totalRevenue,
    organizersPerformanceComparison,
    usersDashboardAnalytics,
    interestPerCategory,
    topSearchesAnalytics,
    topPerformingOrganizers,
    eventsOverTime,
    trends,
    totalMobilePayments,
    organizations,
    clubMembers,
    reservations,
    bookedReservations,
    usersDashboardAnalyticsOrganizer,
    topViewedEvents,
    followersOverTime,    topPerformingEvents
  ] = await Promise.all(promises);
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
      !companyOrganizer && {
        key: "activeUsers",
        title: DASHBOARD_KEYS.activeUsers.title,
        value: users.activeUsersCurrent || 0,
        growth: calculateGrowth(
          users.activeUsersCurrent,
          users.activeUsersPrevious
        ),
        ...withSubFilters("activeUsers"),
      },
      !companyOrganizer && {
        key: "totalOrganizers",
        title: DASHBOARD_KEYS.totalOrganizers.title,
        value: users.organizersCurrent || 0,
        growth: calculateGrowth(
          users.organizersCurrent,
          users.organizersPrevious
        ),
        ...withSubFilters("totalOrganizers"),
      },
      companyOrganizer && {
        key: "totalOrganizations",
        title: DASHBOARD_KEYS.totalOrganizations.title,
        value: organizations.totalOrganizationsCurrent || 0,
        growth: calculateGrowth(
          organizations.totalOrganizationsCurrent,
          organizations.totalOrganizationsPrevious
        ),
        ...withSubFilters("totalOrganizations"),
      },
      companyOrganizer && {
        key: "totalClubMembers",
        title: DASHBOARD_KEYS.totalClubMembers.title,
        value: clubMembers.totalClubMembersCurrent || 0,
        growth: calculateGrowth(
          clubMembers.totalClubMembersCurrent,
          clubMembers.totalClubMembersPrevious
        ),
        ...withSubFilters("totalClubMembers"),
      },
      companyOrganizer && {
        key: "activeClubMembers",
        title: DASHBOARD_KEYS.activeClubMembers.title,
        value: clubMembers.activeClubMembersCurrent || 0,
        growth: calculateGrowth(
          clubMembers.activeClubMembersCurrent,
          clubMembers.activeClubMembersPrevious
        ),
        ...withSubFilters("activeClubMembers"),
      },
      companyOrganizer && {
        key: "totalReservations",
        title: DASHBOARD_KEYS.totalReservations.title,
        value: reservations.totalReservationsCurrent || 0,
        growth: calculateGrowth(
          reservations.totalReservationsCurrent,
          reservations.totalReservationsPrevious
        ),
        ...withSubFilters("totalReservations"),
      },
      companyOrganizer && {
        key: "bookedReservations",
        title: DASHBOARD_KEYS.bookedReservations.title,
        value: bookedReservations.totalBookedReservationsCurrent || 0,
        growth: calculateGrowth(
          bookedReservations.totalBookedReservationsCurrent,
          bookedReservations.totalBookedReservationsPrevious
        ),
        ...withSubFilters("bookedReservations"),
      },

      // ---------------- EVENTS ----------------
      {
        key: "totalEvents",
        title: DASHBOARD_KEYS.totalEvents.title,
        value: allEvents.totalEventsCurrent || 0,
        growth: calculateGrowth(
          allEvents.totalEventsCurrent,
          allEvents.totalEventsPrevious
        ),
        ...withSubFilters("totalEvents"),
      },
      {
        key: "activeEvents",
        title: DASHBOARD_KEYS.activeEvents.title,
        value: activeEvents.totalEventsCurrent || 0,
        growth: calculateGrowth(
          activeEvents.totalEventsCurrent,
          activeEvents.totalEventsPrevious
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
        key: "averageRevenuePerUser",
        title: DASHBOARD_KEYS.averageRevenuePerUser.title,
        value: averageRevenuePerUser.current || 0,
        growth: calculateGrowth(
          averageRevenuePerUser.current,
          averageRevenuePerUser.previous
        ),
        ...withSubFilters("averageRevenuePerUser"),
      },
      {
        key: "totalRevenue",
        title: DASHBOARD_KEYS.totalRevenue.title,
        value: totalRevenue.totalRevenueCurrent || 0,
        growth: calculateGrowth(
          totalRevenue.totalRevenueCurrent,
          totalRevenue.totalRevenuePrevious
        ),
        ...withSubFilters("totalRevenue"),
      },
      !companyOrganizer && {
        key: "totalMobilePayments",
        title: DASHBOARD_KEYS.totalMobilePayments.title,
        value: totalMobilePayments.totalPaymentsCurrent || 0,
        growth: calculateGrowth(
          totalMobilePayments.totalPaymentsCurrent,
          totalMobilePayments.totalPaymentsPrevious
        ),
        ...withSubFilters("totalMobilePayments"),
      },


    ].filter(Boolean),
    ...(!companyOrganizer && { organizersPerformanceComparison }),
    ...(companyOrganizer && { eventPerformanceComparision:organizersPerformanceComparison }),
    ...(!companyOrganizer && { usersDashboardAnalytics }),
    ...(companyOrganizer && { usersDashboardAnalyticsOrganizer }),
    interestPerCategory,
    ...(!companyOrganizer && { topSearchesAnalytics }),
    ...(!companyOrganizer && { topPerformingOrganizers }),
    ...(!companyOrganizer && { organizerActivityOverTime: eventsOverTime, }),
    ...(companyOrganizer && { eventViewsOverTime: eventsOverTime, }),
    ...(companyOrganizer && { topViewedEvents }),
    ...(companyOrganizer && { followersOverTime }),
    ...(companyOrganizer && { topPerformingEvents }),

    trends: trends

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
        key: "averageRevenuePerUser",
        title: DASHBOARD_KEYS.averageRevenuePerUser.title,
        value: averageRevenuePerUser.current || 0,
        growth: calculateGrowth(
          averageRevenuePerUser.current,
          averageRevenuePerUser.previous
        ),
        ...withSubFilters("averageRevenuePerUser"),
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
const getDashboardValue = async ({
  key,
  subFilter,
  dateFilter,
  timezone,
}) => {
  const ranges = getDateRanges({ dateFilter, timezone });
  const match = buildMatchByKey({ key, subFilter });

  let current = 0;
  let previous = 0;

  // ✅ USER BASED METRICS
  if (
    ["totalUsers", "totalOrganizers", "activeUsers"].includes(key)
  ) {
    [current, previous] = await Promise.all([
      dashboardRepo.getUserSingleMetric({
        match,
        range: ranges
          ? { start: ranges.start, end: ranges.end }
          : null,
      }),
      ranges
        ? dashboardRepo.getUserSingleMetric({
          match,
          range: {
            start: ranges.prevStart,
            end: ranges.prevEnd,
          },
        })
        : Promise.resolve(0),
    ]);
  }

  // ✅ EVENT BASED METRICS
  if (["totalEvents", "activeEvents"].includes(key)) {
    [current, previous] = await Promise.all([
      dashboardRepo.getEventSingleMetric({
        match,
        range: ranges
          ? { start: ranges.start, end: ranges.end }
          : null,
      }),
      ranges
        ? dashboardRepo.getEventSingleMetric({
          match,
          range: {
            start: ranges.prevStart,
            end: ranges.prevEnd,
          },
        })
        : Promise.resolve(0),
    ]);
  }

  // ✅ TICKET BASED METRICS
  if (key === "ticketsSold") {
    [current, previous] = await Promise.all([
      dashboardRepo.getTicketSingleMetric({
        match,
        range: ranges
          ? { start: ranges.start, end: ranges.end }
          : null,
      }),
      ranges
        ? dashboardRepo.getTicketSingleMetric({
          match,
          range: {
            start: ranges.prevStart,
            end: ranges.prevEnd,
          },
        })
        : Promise.resolve(0),
    ]);
  }

  return {
    key,
    value: current,
    growth: calculateGrowth(current, previous),
  };
};

const getOrganizerPerformanceComparisonService = async ({
  organizerId,
  organizationId,
  timezone,
  year,
  companyOrganizer
}) => {
  const raw = await dashboardRepo.getOrganizerPerformanceByMonth({
    organizerId,
    organizationId,
    timezone,
    year,
    companyOrganizer
  });
  const monthMap = {
    1: "January",
    2: "February",
    3: "March",
    4: "April",
    5: "May",
    6: "June",
    7: "July",
    8: "August",
    9: "September",
    10: "October",
    11: "November",
    12: "December",
  };

  const normalized = Object.values(monthMap).map((m) => ({
    month: m,
    tickets: 0,
    revenue: 0,
  }));

  for (const r of raw) {
    const index = r._id - 1;
    if (normalized[index]) {
      normalized[index].tickets = r.ticketsSold || 0;
      normalized[index].revenue = Math.round(r.revenue || 0);
    }
  }

  return normalized;
};


const getUsersDashboardAnalytics = async (year = new Date().getFullYear()) => {
  let users = await dashboardRepo.getUsersForDashboardAnalytics(year);
  return buildUserDashboardAnalytics(users);
};
const getOrganizerUsersDashboardAnalytics = async (companyOrganizer, year = new Date().getFullYear()) => {
  let users = await dashboardRepo.getOrganizerUsersForDashboardAnalytics(companyOrganizer, year);
  return buildUserDashboardAnalytics(users);
};

const getInterestPerCategoryService = async (companyOrganizer) => {
  let rows;
  if (!companyOrganizer) {
    rows = await dashboardRepo.getRawInterestData();
  }
  if (companyOrganizer) {
    const year = new Date().getFullYear();
    users = await dashboardRepo.getOrganizerUsersForDashboardAnalytics(companyOrganizer, year);
    rows = await dashboardRepo.getRawInterestDataByOrganizer(users);
  }


  return buildInterestPerCategory(rows);
};
const getTrends = async (companyOrganizer) => {
  const [salesRows, revenueRows] = await Promise.all([
    dashboardRepo.getTotalTrendSales(companyOrganizer),
    dashboardRepo.getTotalTrendRevenue(companyOrganizer)
  ]);

  return buildTotalTrend(salesRows, revenueRows);
};

const getTopSearchesAnalytics = async () => {
  const rows = await dashboardRepo.getRawSearchStats();
  return buildSearchVolumeByMonth(rows);
};

const getTopPerformingOrganizers = async () => {
  const rows = await dashboardRepo.getRawTopPerformingOrganizers();
  return buildTopPerformingOrganizers(rows);
}

const getEventsOverTimeService = async (companyOrganizer) => {
  let rows;
  if (!companyOrganizer) {
    rows = await dashboardRepo.getEventsOverTimeRaw();
  }
  if (companyOrganizer) {
    rows = await dashboardRepo.getEventsViewsOverTimeService(companyOrganizer);
  }
  return buildEventsOverTime(rows);
}
const getTopViewedEvents = async (companyOrganizer) => {
  let rows;
  if (companyOrganizer) {
    rows = await dashboardRepo.getTopViewedEvents(companyOrganizer);
  }
  return buildMostViewedEvents(rows);
}
    const getFollowersOverTimeRaw = async (companyOrganizer) => {
      const rows = await dashboardRepo.getFollowersOverTimeRaw(companyOrganizer);
      return buildFollowersOverTime(rows);
    }
const getRawTopPerformingEvents = async (companyOrganizer) => {
  const rows = await dashboardRepo.getRawTopPerformingEvents(companyOrganizer);
  return buildTopEvents(rows);
}


module.exports = {
  getOrganizerPerformanceComparisonService,
  getDashboard,
  getDashboardValue,
  getDashboardStats,
  getTrends,
};
