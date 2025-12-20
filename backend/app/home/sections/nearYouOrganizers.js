const { distanceScore } = require("../scoring/distance");
const { popularityScore } = require("../scoring/popularity");

module.exports = function nearYouOrganizers(items) {
  return items
    .map(item => ({
      ...item,
      score:
        0.7 * distanceScore(item.distanceKm ?? 999) +
        0.3 * popularityScore(item.stats || {})
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
