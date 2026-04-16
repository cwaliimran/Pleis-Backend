const { getFullImageUrl } = require("@utils/imageHelper");

const buildTopEvents = (rows = [], limit = 6) => {
  if (!rows.length) return [];

  const maxRevenue = Math.max(...rows.map(r => r.revenue || 0), 1);
  const maxTx = Math.max(...rows.map(r => r.transactions || 0), 1);

  return rows
    .map(r => {
      const normalizedRevenue = (r.revenue || 0) / maxRevenue;
      const normalizedTx = (r.transactions || 0) / maxTx;

      const engagement = Math.round(
        (0.7 * normalizedRevenue + 0.3 * normalizedTx) * 100
      );

      return {
        eventId: r._id,
        eventName: r.eventName || "Unknown Event",
        eventLogo: r.eventLogo
          ? getFullImageUrl(r.eventLogo)
          : "",
        revenue: r.revenue || 0,
        transactions: r.transactions || 0,
        engagement
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
};

module.exports = { buildTopEvents };