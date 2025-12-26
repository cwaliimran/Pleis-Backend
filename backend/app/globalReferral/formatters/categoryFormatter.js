const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

/**
 * Pure formatter for category objects (safe for doc or plain object)
 */
function formatCategory(category) {
  if (!category) return null;

  // Handle both Mongoose doc and plain object
  const cat = category.toObject ? category.toObject() : { ...category };

  return {
    ...cat,
    profileIcon: getFullImageUrl(cat.profileIcon || "noimage.png"),
  };
}

/**
 * Safe formatter for arrays of categories
 */
function formatCategories(categories = []) {
  return categories.map(formatCategory);
}

module.exports = { formatCategory, formatCategories };
