const { popularityScore } = require("../scoring/popularity");

module.exports = function newOrganizers(items) {
  const now = Date.now();

  return items
    .map(item => {
      const ageDays =
        (now - new Date(item.createdAt).getTime()) / 86400000;

      const recency = Math.max(0, 1 - ageDays / 30);

      return {
        ...item,
        score: 0.8 * recency + 0.2 * popularityScore(item.stats || {})
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
