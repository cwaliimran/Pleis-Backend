const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

/**
 * Pure formatter for Update objects (safe for doc or plain object)
 */
function formatUpdate(Update) {
  if (!Update) return null;

  // Handle both Mongoose doc and plain object
  const cat = Update.toObject ? Update.toObject() : { ...Update };

  return {
    ...cat,
    image: getFullImageUrl(cat.image || "noimage.png"),
  };
}

/**
 * Safe formatter for arrays of categories
 */
function formatCategories(categories = []) {
  return categories.map(formatUpdate);
}

module.exports = { formatUpdate, formatCategories };
