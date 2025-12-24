/**
 * Relevance score
 * Matches user preferences against item metadata
 */

const { clamp01 } = require("./normalize");

const relevanceScore = ({
  itemTags = [],
  itemCategories = [],
  userPreferences = []
}) => {
  if (!userPreferences.length) return 0;

  let matches = 0;

  for (const pref of userPreferences) {
    if (
      itemTags.includes(pref) ||
      itemCategories.includes(pref)
    ) {
      matches++;
    }
  }

  return clamp01(matches / userPreferences.length);
};

module.exports = {
  relevanceScore
};
