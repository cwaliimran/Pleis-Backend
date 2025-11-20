const { getFullImageUrl } = require("@utils/imageHelper");

/**
 * Formats the `object` field inside BannerControls dynamically
 * depending on its type and model.
 *
 * @param {Object} obj - Populated `object` document
 */
function formatItemCategory(item) {
  if (!item) return null;
  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (!obj) return null;

  // Format image URL
  obj.image = getFullImageUrl(obj.image || "noimage.png");

  return obj;
}

module.exports = { formatItemCategory };
