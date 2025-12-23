const { logNormalize } = require("../scoring/normalize");

module.exports = function trendingOrganizers(items) {
  return items
    .map(item => {
      const views48h = logNormalize(item.views48h || 0, 5000);
      const views7d = logNormalize(item.views7d || 0, 20000);

      return {
        ...item,
        score: 0.7 * views48h + 0.3 * views7d
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
