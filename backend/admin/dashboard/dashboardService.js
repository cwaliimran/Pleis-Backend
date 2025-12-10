const dashboardRepo = require("./dashboardRepository");
const { calculateGrowth } = require("./utils/dashboardDate.utils");
const { DASHBOARD_KEYS, withSubFilters } = require("./utils/dashboardKeyMap");
const { buildMatchByKey } = require("./utils/dashboardKeyMatch");
const { getDateRanges } = require("./utils/dashboardDate.utils");

/**
 * DASHBOARD – Load all cards at once
 */
const getDashboard = async ({ dateFilter, timezone }) => {
  // ✅ Parallel stats fetch
  const [users, events, ticketsSold, averageTicketPrice] = await Promise.all([
    dashboardRepo.getUserStats({ dateFilter, timezone }),
    dashboardRepo.getEventStats({ dateFilter, timezone }),
    dashboardRepo.getTicketsSoldStats({ dateFilter, timezone }),
    dashboardRepo.getAverageTicketPriceStats({ dateFilter, timezone }),
  ]);


  return {
    dashboard: [
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
    ],
  };

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

module.exports = {
  getDashboard,
  getDashboardValue,
};
