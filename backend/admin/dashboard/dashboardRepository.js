const { User } = require("@UserModel");
const { Events } = require("@EventsModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { getDateRanges } = require("./utils/dashboardDate.utils");



// ---------------- USERS ----------------
const getUserStats = async ({ dateFilter, timezone }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const baseMatch = {
    "accountState.status": { $ne: "deleted" },
  };

  const withRange = (extra, range) => ({
    ...baseMatch,
    ...extra,
    ...(range ? { createdAt: range } : {}),
  });

  return {
    totalUsersCurrent: await User.countDocuments(
      withRange(
        { "accountState.userType": "user" },
        ranges && { $gte: ranges.start, $lt: ranges.end }
      )
    ),

    totalUsersPrevious: ranges
      ? await User.countDocuments(
        withRange(
          { "accountState.userType": "user" },
          { $gte: ranges.prevStart, $lt: ranges.prevEnd }
        )
      )
      : 0,

    organizersCurrent: await User.countDocuments(
      withRange(
        { "accountState.userType": "organizer" },
        ranges && { $gte: ranges.start, $lt: ranges.end }
      )
    ),

    organizersPrevious: ranges
      ? await User.countDocuments(
        withRange(
          { "accountState.userType": "organizer" },
          { $gte: ranges.prevStart, $lt: ranges.prevEnd }
        )
      )
      : 0,

    activeUsersCurrent: await User.countDocuments(
      withRange(
        {
          "accountState.userType": "user",
          "accountState.status": "active",
        },
        ranges && { $gte: ranges.start, $lt: ranges.end }
      )
    ),

    activeUsersPrevious: ranges
      ? await User.countDocuments(
        withRange(
          {
            "accountState.userType": "user",
            "accountState.status": "active",
          },
          { $gte: ranges.prevStart, $lt: ranges.prevEnd }
        )
      )
      : 0,
  };
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
const getEventStats = async ({ dateFilter, timezone }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const baseMatch = {
    status: { $ne: "deleted" },
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

  console.log("finalMatch", finalMatch)

  const result = await Events.aggregate([
    { $match: finalMatch },
    { $count: "count" },
  ]);

  return result[0]?.count || 0;
};


//get ticket sold stats

// ---------------- SINGLE METRICS ----------------

const getTicketsSoldStats = async ({ dateFilter, timezone }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const baseMatch = {
    purpose: "eventTicketPurchase",
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


const getAverageTicketPriceStats = async ({ dateFilter, timezone }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const baseMatch = {
    purpose: "eventTicketPurchase",
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



module.exports = {
  getUserStats,
  getUserSingleMetric,
  getEventStats,
  getEventSingleMetric,
  getTicketsSoldStats,
  getTicketSingleMetric,
  getAverageTicketPriceStats,

};