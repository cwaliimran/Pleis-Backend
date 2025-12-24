const { getFullImageUrl } = require("@utils/imageHelper");
const { convertUtcToTimezone } = require("@utils/responseUtil");

/**
 * Formats the `object` field inside BannerControls dynamically
 * depending on its type and model.
 *
 * @param {Object} obj - Populated `object` document
 * @param {String} type - The type field ("Event", "Organizer", "LoyaltyProgram", etc.)
 * @returns {Object|null}
 */
function formatGlobalCategory(item, timezone) {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (!obj) return null;

  // Format image URL
  obj.image = getFullImageUrl(obj.image || "noimage.png");

  // Convert stored UTC times to user timezone (display only)
  if (obj.startTime && obj.endTime) {
    obj.startTime = convertUtcToTimezone(obj.startTime, timezone, "hh:mm A");
    obj.endTime = convertUtcToTimezone(obj.endTime, timezone, "hh:mm A");
  }

  // Attach nested menu (with venue inside) and category
  if (obj.menu && typeof obj.menu === "object" && !obj.menu._bsontype) {
    obj.menu = obj.menuData || null;
    obj.category = obj.categoryData || null;
  }

  return obj;
}

module.exports = { formatGlobalCategory };
