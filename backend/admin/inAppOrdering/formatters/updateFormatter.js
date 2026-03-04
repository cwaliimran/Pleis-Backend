const { getFullImageUrl } = require("../../../helperUtils/imageHelper");
const { convertDateFormat } = require("../../../helperUtils/responseUtil");

/**
 * Pure formatter for Update objects (safe for doc or plain object)
 */
function formatUpdate(Update) {
  if (!Update) return null;

  // Handle both Mongoose doc and plain object
  const cat = Update.toObject ? Update.toObject() : { ...Update };

  cat.startTime = convertDateFormat(cat.startTime, "hh:mm A")
  cat.endTime = convertDateFormat(cat.endTime, "hh:mm A")
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
function formatMenuItemSale(sale) {
  if (!sale) return null;

  const s = sale.toObject ? sale.toObject() : { ...sale };

  return {
    ...s,
    menuItems: Array.isArray(s.menuItems)
      ? s.menuItems.map(item => ({
        ...item,
        image: getFullImageUrl(item.image || "noimage.png"),
      }))
      : [],
  };
}


module.exports = { formatUpdate, formatCategories, formatMenuItemSale };
