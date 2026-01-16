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

/**
 * DASHBOARD – Load all cards at once
 */
const getDashboard = async ({ dateFilter, timezone }) => {
  // ✅ Parallel stats fetch
  const [users, events, ticketsSold, averageTicketPrice, averageRevenuePerUser, organizersPerformanceComparison, usersDashboardAnalytics, interestPerCategory, topSearchesAnalytics, topPerformingOrganizers, eventsOverTime] = await Promise.all([
    dashboardRepo.getUserStats({ dateFilter, timezone }),
    dashboardRepo.getEventStats({ dateFilter, timezone }),
    dashboardRepo.getTicketsSoldStats({ dateFilter, timezone }),
    dashboardRepo.getAverageTicketPriceStats({ dateFilter, timezone }),
    dashboardRepo.getAverageRevenuePerUserStats({ dateFilter, timezone }),
    // getOrganizerPerformanceComparisonService({ timezone }),
    // getUsersDashboardAnalytics(),
    // getInterestPerCategoryService(),
    // getTopSearchesAnalytics(),
    // getTopPerformingOrganizers(),
    // getEventsOverTimeService()
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

    ],
    // organizersPerformanceComparison,
    // usersDashboardAnalytics,
    // interestPerCategory,
    // topSearchesAnalytics,
    // topPerformingOrganizers,
    // organizerActivityOverTime: eventsOverTime

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
}) => {
  const raw = await dashboardRepo.getOrganizerPerformanceByMonth({
    organizerId,
    organizationId,
    timezone,
    year,
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


const getInterestPerCategoryService = async () => {
  const rows = await dashboardRepo.getRawInterestData();
  return buildInterestPerCategory(rows);
};

const getTopSearchesAnalytics = async () => {
  const rows = await dashboardRepo.getRawSearchStats();
  return buildSearchVolumeByMonth(rows);
};

const getTopPerformingOrganizers = async () => {
  const rows = await dashboardRepo.getRawTopPerformingOrganizers();
  return buildTopPerformingOrganizers(rows);
}

const getEventsOverTimeService = async () => {
  const rows = await dashboardRepo.getEventsOverTimeRaw();
  return buildEventsOverTime(rows);
}

module.exports = {
  getOrganizerPerformanceComparisonService,
  getDashboard,
  getDashboardValue,
};
