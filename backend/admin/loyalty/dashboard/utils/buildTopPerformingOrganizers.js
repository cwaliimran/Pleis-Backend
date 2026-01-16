const { getFullImageUrl } = require("@utils/imageHelper");

const buildTopPerformingOrganizers = (rows = [], limit = 5) => {
  if (!rows.length) return [];

  const maxUsers = Math.max(...rows.map(r => r.uniqueUsers), 1);
  const maxTx = Math.max(...rows.map(r => r.transactions), 1);

  return rows
    .map(r => {
      const normalizedUsers = r.uniqueUsers / maxUsers;
      const normalizedTx = r.transactions / maxTx;

      const engagement = Math.round(
        (0.6 * normalizedUsers + 0.4 * normalizedTx) * 100
      );

      return {
        organizerName: r.organizerName || "Unknown Organizer",
        organizerLogo: r.organizerLogo ? getFullImageUrl(r.organizerLogo) : "",
        revenue: r.revenue,
        engagement
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
};

module.exports = { buildTopPerformingOrganizers };
