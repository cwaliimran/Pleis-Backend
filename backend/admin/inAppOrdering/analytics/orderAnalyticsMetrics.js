/**
 * Ordering analytics figures (Requirement Set #131; Defects Report v1.5 D-06,
 * Appendix A). Every figure is computed from the order records of the
 * organizations in scope, with these definitions:
 *
 *   Orders        orders shown on the order list (awaiting an up-front Pleis
 *                 payment are hidden there, so here too), by createdAt.
 *   Sales         orders with paymentStatus "paid". Revenue, average order
 *                 value, items sold, categories, sales source, loyalty impact
 *                 and menu item performance count only these. Refunded,
 *                 unpaid-closed, failed and still-unpaid orders bring no money.
 *   Revenue       what the guest paid: totalPrice (tip included), in euros
 *                 with cents, never truncated.
 *   After commission
 *                 the organizer's net from the payout split (commissionSplit,
 *                 the same as the transaction list and the statement), with
 *                 the configured ordering and tip rates.
 *
 * organizations: undefined = every organization (super admin, global view);
 * an array limits the figures to it, and an empty array matches nothing.
 */
const MenuOrders = require("../../../commonModules/menuItemsAndOrders/Orders");
const { visibleOnOrderBoardMatch } = require("../../../commonModules/menuItemsAndOrders/orderVisibilityFilter");
const { splitOrdering } = require("../../../commonModules/paymentsIntegrations/ledger/commissionSplit");
const { loadCommissionRates } = require("../../../commonModules/paymentsIntegrations/ledger/statementService");
const { getDateRanges, calculateGrowth } = require("./utils/analyticsDate.utils");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOUR_MS = 60 * 60 * 1000;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const cents = (euros) => Math.round((Number(euros) || 0) * 100);

const scopeMatch = (organizations) =>
  Array.isArray(organizations) ? { organization: { $in: organizations } } : {};

const createdIn = (start, end) => (start ? { createdAt: { $gte: start, $lt: end } } : {});

/** Orders on the order list, in scope, created in [start, end). */
const ordersMatch = (organizations, start, end) => ({
  ...scopeMatch(organizations),
  ...visibleOnOrderBoardMatch,
  ...createdIn(start, end),
});

/** Paid orders (sales), in scope, created in [start, end). */
const salesMatch = (organizations, start, end) => ({
  ...ordersMatch(organizations, start, end),
  paymentStatus: "paid",
});

/** Organizer net of one paid order, in cents (payout split). */
const organizerNetCents = (order, rates) => {
  const receivedCents = cents(order.totalPrice);
  const tipCents = Math.min(receivedCents, cents(order.priceBreakdown?.tip));
  return splitOrdering({
    orderGrossCents: receivedCents - tipCents,
    tipCents,
    orderingRate: rates.ordering,
    tipRate: rates.tip,
  }).organizerNetCents;
};

/** Item source for the sales source breakdown; one per line, so shares add up to 100 %. */
const itemSource = (item) => {
  const snap = item.menuItemSnapShot || {};
  if (snap.isLimitedTimeOffer === true) return "Limited";
  if (snap.upSellItem === true) return "Upsell";
  return "Regular";
};

const SALE_PROJECTION = {
  totalPrice: 1,
  "priceBreakdown.tip": 1,
  createdAt: 1,
  "items.quantity": 1,
  "items.finalPrice": 1,
  "items.menuItemSnapShot.isLimitedTimeOffer": 1,
  "items.menuItemSnapShot.upSellItem": 1,
  "combos.quantity": 1,
  "combos.finalPrice": 1,
};

const sumRevenue = (sales) => sales.reduce((s, o) => s + (Number(o.totalPrice) || 0), 0);

/** Hours the period covers so far: from its start (or the first order) to now or its end. */
const hoursInPeriod = async (organizations, range) => {
  const now = Date.now();
  let start = range?.start ? new Date(range.start).getTime() : null;
  if (start == null) {
    const first = await MenuOrders.findOne(ordersMatch(organizations)).sort({ createdAt: 1 }).select("createdAt").lean();
    if (!first) return 0;
    start = new Date(first.createdAt).getTime();
  }
  const end = range?.end ? Math.min(new Date(range.end).getTime(), now) : now;
  return Math.max((end - start) / HOUR_MS, 1);
};

const mostOrderedSubCategory = async (organizations, range) => {
  const [top] = await MenuOrders.aggregate([
    { $match: salesMatch(organizations, range?.start, range?.end) },
    { $unwind: "$items" },
    { $lookup: { from: "menuitems", localField: "items.menuItem", foreignField: "_id", as: "live" } },
    {
      $addFields: {
        subCategory: { $ifNull: [{ $first: "$live.subCategory" }, "$items.menuItemSnapShot.subCategory"] },
      },
    },
    { $match: { subCategory: { $ne: null } } },
    { $group: { _id: "$subCategory", qty: { $sum: "$items.quantity" } } },
    { $sort: { qty: -1 } },
    { $limit: 1 },
    { $lookup: { from: "menusubcategories", localField: "_id", foreignField: "_id", as: "cat" } },
    { $project: { title: { $ifNull: [{ $first: "$cat.title" }, "Uncategorized"] } } },
  ]);
  return top?.title || "N/A";
};

/** Stat cards. */
const orderStats = async ({ organizations, dateFilter, timezone, rates }) => {
  const range = getDateRanges({ dateFilter, timezone });

  const [ordersCurrent, ordersPrevious, sales, previousSales, hours, topCategory] = await Promise.all([
    MenuOrders.countDocuments(ordersMatch(organizations, range?.start, range?.end)),
    range ? MenuOrders.countDocuments(ordersMatch(organizations, range.prevStart, range.prevEnd)) : 0,
    MenuOrders.find(salesMatch(organizations, range?.start, range?.end)).select(SALE_PROJECTION).lean(),
    range
      ? MenuOrders.find(salesMatch(organizations, range.prevStart, range.prevEnd)).select({ totalPrice: 1 }).lean()
      : [],
    hoursInPeriod(organizations, range),
    mostOrderedSubCategory(organizations, range),
  ]);

  const revenue = sumRevenue(sales);
  const netCents = sales.reduce((s, o) => s + organizerNetCents(o, rates), 0);
  let itemsSold = 0;
  let limitedItems = 0;
  for (const o of sales) {
    for (const i of o.items || []) {
      const q = Number(i.quantity) || 0;
      itemsSold += q;
      if (itemSource(i) === "Limited") limitedItems += q;
    }
    for (const c of o.combos || []) itemsSold += Number(c.quantity) || 0;
  }

  return {
    totalOrders: ordersCurrent,
    totalOrdersGrowth: range ? calculateGrowth(ordersCurrent, ordersPrevious) : 0,
    totalRevenue: round2(revenue),
    totalRevenueGrowth: range ? calculateGrowth(round2(revenue), round2(sumRevenue(previousSales))) : 0,
    revenueAfterCommission: round2(netCents / 100),
    // Average order value: revenue per paid order.
    averageOrderValue: sales.length ? round2(revenue / sales.length) : 0,
    orderFrequencyPerHour: hours ? round2(ordersCurrent / hours) : 0,
    mostOrderedCategory: topCategory,
    totalItemsSold: itemsSold,
    totalLimitedTimeItems: limitedItems,
  };
};

/** Monthly series for the current year (in the viewer's timezone). */
const monthlySeries = async ({ organizations, timezone, rates }) => {
  const year = new Date().getFullYear();
  const start = new Date(Date.UTC(year, 0, 1) - 14 * HOUR_MS); // widened; filtered by local month below
  const end = new Date(Date.UTC(year + 1, 0, 1) + 14 * HOUR_MS);
  const tz = timezone || "UTC";
  const monthOf = (d) =>
    Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric" }).format(d)) - 1;
  const yearOf = (d) => Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(d));
  const hourOf = (d) =>
    Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(d));

  const [orders, sales] = await Promise.all([
    MenuOrders.find(ordersMatch(organizations, start, end)).select({ createdAt: 1 }).lean(),
    MenuOrders.find(salesMatch(organizations, start, end)).select(SALE_PROJECTION).lean(),
  ]);

  const count = Array(12).fill(0);
  const byHour = Array(24).fill(0);
  for (const o of orders) {
    const d = new Date(o.createdAt);
    if (yearOf(d) !== year) continue;
    count[monthOf(d)] += 1;
    byHour[hourOf(d)] += 1;
  }

  const revenue = Array(12).fill(0);
  const netCents = Array(12).fill(0);
  const paidCount = Array(12).fill(0);
  for (const o of sales) {
    const d = new Date(o.createdAt);
    if (yearOf(d) !== year) continue;
    const m = monthOf(d);
    revenue[m] += Number(o.totalPrice) || 0;
    netCents[m] += organizerNetCents(o, rates);
    paidCount[m] += 1;
  }

  return {
    ordersOverTime: MONTHS.map((month, i) => ({ month, value: count[i] })),
    revenueOverTime: MONTHS.map((month, i) => ({
      month,
      totalRevenue: round2(revenue[i]),
      // Net income: what the organizer keeps after commission.
      netIncome: round2(netCents[i] / 100),
    })),
    averageOrderValueOverTime: MONTHS.map((month, i) => ({
      month,
      value: paidCount[i] ? round2(revenue[i] / paidCount[i]) : 0,
    })),
    // 3-hour buckets 0-2, 3-5, … 21-23; each bucket sums its three hours.
    orderByHour: Array.from({ length: 8 }, (_, b) => ({
      time: `${b * 3}-${b * 3 + 2}`,
      count: byHour[b * 3] + byHour[b * 3 + 1] + byHour[b * 3 + 2],
    })),
  };
};

/** Category breakdown of items sold (paid orders, selected period). */
const categoryBreakdown = async ({ organizations, dateFilter, timezone }) => {
  const range = getDateRanges({ dateFilter, timezone });
  const rows = await MenuOrders.aggregate([
    { $match: salesMatch(organizations, range?.start, range?.end) },
    { $unwind: "$items" },
    { $lookup: { from: "menuitems", localField: "items.menuItem", foreignField: "_id", as: "live" } },
    { $group: { _id: { $first: "$live.category" }, count: { $sum: "$items.quantity" } } },
    { $match: { _id: { $ne: null } } },
    { $lookup: { from: "menuitemcategories", localField: "_id", foreignField: "_id", as: "cat" } },
    { $project: { _id: 0, categoryName: { $ifNull: [{ $first: "$cat.title" }, "Uncategorized"] }, count: 1 } },
    { $sort: { count: -1 } },
  ]);
  const total = rows.reduce((s, r) => s + r.count, 0);
  return rows.map((r) => ({ ...r, percent: total ? round2((r.count / total) * 100) : 0 }));
};

/**
 * Promotional against regular sales (paid orders, selected period).
 * count   = paid orders containing at least one item of that source
 * percent = that source's share of item revenue (sources are exclusive per
 *           item: limited-time, else upsell, else regular), adds up to 100 %.
 */
const salesSourceBreakdown = async ({ organizations, dateFilter, timezone }) => {
  const range = getDateRanges({ dateFilter, timezone });
  const sales = await MenuOrders.find(salesMatch(organizations, range?.start, range?.end)).select(SALE_PROJECTION).lean();
  const sources = ["Regular", "Upsell", "Limited"];
  const orders = { Regular: 0, Upsell: 0, Limited: 0 };
  const value = { Regular: 0, Upsell: 0, Limited: 0 };
  for (const o of sales) {
    const seen = new Set();
    for (const i of o.items || []) {
      const s = itemSource(i);
      seen.add(s);
      value[s] += Number(i.finalPrice) || 0;
    }
    for (const c of o.combos || []) {
      seen.add("Regular");
      value.Regular += Number(c.finalPrice) || 0;
    }
    for (const s of seen) orders[s] += 1;
  }
  const total = sources.reduce((s, k) => s + value[k], 0);
  return sources.map((reservationType) => ({
    reservationType,
    count: orders[reservationType],
    percent: total ? round2((value[reservationType] / total) * 100) : 0,
  }));
};

module.exports = {
  loadCommissionRates,
  orderStats,
  monthlySeries,
  categoryBreakdown,
  salesSourceBreakdown,
  scopeMatch,
  ordersMatch,
  salesMatch,
  round2,
};
