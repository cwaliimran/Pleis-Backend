const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

/**
 * Pure formatter for item objects (safe for doc or plain object)
 */
function tiersFormatter(item) {
  if (!item) return null;

  // Handle both Mongoose doc and plain object
  const cat = item.toObject ? item.toObject() : { ...item };

  return {
    ...cat,
    image: getFullImageUrl(cat.image || "noimage.png"),
  };
}

module.exports = { tiersFormatter,};
