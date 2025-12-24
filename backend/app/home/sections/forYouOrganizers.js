const { relevanceScore } = require("../scoring/relevance");
const { popularityScore } = require("../scoring/popularity");

module.exports = function forYouOrganizers(items, userPrefs) {
  return items
    .map(item => ({
      ...item,
      score:
        0.7 * relevanceScore({
          itemTags: item.tags || [],
          itemCategories: item.categories || [],
          userPreferences: userPrefs || []
        }) +
        0.3 * popularityScore(item.stats || {})
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
