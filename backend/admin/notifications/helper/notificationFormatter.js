const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

/**
 * Pure formatter for category objects (safe for doc or plain object)
 */
function notificationFormatter(category) {
  if (!category) return null;

  // Handle both Mongoose doc and plain object
  const cat = category.toObject ? category.toObject() : { ...category };

  return {
    ...cat,
    image: getFullImageUrl(cat.image || "noimage.png"),
  };
}
module.exports = { notificationFormatter};
