const { logNormalize, clamp01 } = require("../scoring/normalize");

module.exports = function popularEvents(events) {
  return events
    .map(evt => {
      const views = logNormalize(evt.views || 0, 50000);
      const likes = logNormalize(evt.likes || 0, 10000);
      const reviews = clamp01((evt.avgRating - 1) / 4);

      return {
        ...evt,
        score: 0.5 * views + 0.3 * likes + 0.2 * reviews
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
