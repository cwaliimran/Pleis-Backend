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
function formatMenuItem(item, timezone) {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;
  if (!obj) return null;

  obj.image = getFullImageUrl(obj.image || "noimage.png");
  obj.startTime=convertUtcToTimezone(obj.startTime,timezone,"hh:mm A");
  obj.endTime=convertUtcToTimezone(obj.endTime,timezone,"hh:mm A");

  // ✅ SAFE MENU HANDLING
  if (obj.menuData) {
    obj.menu = obj.menuData;
  }

  if (obj.categoryData) {
    obj.category = obj.categoryData;
  }

  // Optional cleanup
  delete obj.menuData;
  delete obj.categoryData;

  return obj;
}

function formatBundleMenuItem(item, timezone) {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;
  if (!obj) return null;

  // Keep formatting logic (if you need it for other use-cases)
  if (obj.startTime && obj.endTime) {
    obj.startTime = convertUtcToTimezone(obj.startTime, timezone, "hh:mm A");
    obj.endTime = convertUtcToTimezone(obj.endTime, timezone, "hh:mm A");
  }

  // Return ONLY required fields
  return {
    _id: obj._id,
    title: obj.title,
    price: obj.basePrice|| 0, // choose price
  };
}

module.exports = { formatMenuItem,formatBundleMenuItem };
