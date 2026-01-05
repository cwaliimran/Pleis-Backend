const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

/**
 * Pure formatter for Update objects (safe for doc or plain object)
 */
function formatGiveaway(item) {
  if (!item) return null;

  // Handle both Mongoose doc and plain object
  const obj = item.toObject ? item.toObject() : { ...item };
  return {
    ...obj,
    image: getFullImageUrl(obj.image || "noimage.png"),
  };
}

/**
 * Safe formatter for arrays of giveaways
 */
function formatGiveaways(giveaways = []) {
  return giveaways.map(formatGiveaway);
}

module.exports = { formatGiveaway, formatGiveaways };
