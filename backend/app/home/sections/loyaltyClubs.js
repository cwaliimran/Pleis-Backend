const { relevanceScore } = require("../scoring/relevance");
const { popularityScore } = require("../scoring/popularity");
const { logNormalize } = require("../scoring/normalize");

module.exports = function loyaltyClubs(items, userPrefs) {
  return items
    .filter(i => !i.isMember)
    .map(item => ({
      ...item,
      score:
        0.5 * relevanceScore({
          itemTags: item.tags || [],
          itemCategories: item.categories || [],
          userPreferences: userPrefs || []
        }) +
        0.3 * logNormalize(item.membersCount || 0, 100000) +
        0.2 * popularityScore(item.stats || {})
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
