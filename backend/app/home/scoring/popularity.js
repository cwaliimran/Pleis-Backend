/**
 * Popularity score
 * Likes are weighted higher than views
 */

const { logNormalize, clamp01 } = require("./normalize");

const popularityScore = ({
  views = 0,
  likes = 0,
  maxViews = 100000,
  maxLikes = 10000
}) => {
  const viewsNorm = logNormalize(views, maxViews);
  const likesNorm = logNormalize(likes, maxLikes);

  return clamp01(
    0.25 * viewsNorm +
    0.75 * likesNorm
  );
};

module.exports = {
  popularityScore
};
