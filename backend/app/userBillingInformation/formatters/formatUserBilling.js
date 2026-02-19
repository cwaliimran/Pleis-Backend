const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

/**
 * Pure formatter for category objects (safe for doc or plain object)
 */
function formatUserBilling(category) {
  if (!category) return null;

  // Handle both Mongoose doc and plain object
  const cat = category.toObject ? category.toObject() : { ...category };

  return {
    ...cat,
    user: {
      ...cat.user,
      profileIcon: getFullImageUrl(cat.user?.profileIcon || "noimage.png"),
    },
  };
}

/**
 * Safe formatter for arrays of categories
 */
function formatbilling(categories = []) {
  return categories.map(formatUserBilling);
}

module.exports = { formatUserBilling, formatbilling };
