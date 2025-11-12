const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

/**
 * Pure formatter for category objects (safe for doc or plain object)
 */
function formatStatusBadge(item) {
  if (!item) return null;

  // Handle both Mongoose doc and plain object
  const itemObj = item.toObject ? item.toObject() : { ...item };

  return {
    ...itemObj,
    image: getFullImageUrl(itemObj.image || "noimage.png"),
    backgroundImage: getFullImageUrl(itemObj.backgroundImage || "noimage.png"),
  };
}

/**
 * Safe formatter for arrays of status badges
 */
function formatStatusBadges(statusBadges = []) {
  return statusBadges.map(formatStatusBadge);
}

module.exports = { formatStatusBadge, formatStatusBadges };