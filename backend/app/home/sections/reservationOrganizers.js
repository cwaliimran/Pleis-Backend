const { relevanceScore } = require("../scoring/relevance");
const { popularityScore } = require("../scoring/popularity");
const { clamp01 } = require("../scoring/normalize");

module.exports = function reservationOrganizers(items, userPrefs) {
  return items
    .filter(i => i.reservationsEnabled)
    .map(item => {
      const reviewScore = clamp01((item.avgRating - 1) / 4);

      return {
        ...item,
        score:
          0.4 * relevanceScore({
            itemTags: item.tags || [],
            itemCategories: item.categories || [],
            userPreferences: userPrefs || []
          }) +
          0.3 * popularityScore(item.stats || {}) +
          0.3 * reviewScore
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
