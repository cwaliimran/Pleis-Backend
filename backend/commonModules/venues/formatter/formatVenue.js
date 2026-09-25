const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

/** True when floorPlan is missing or a placeholder (e.g. noimage.png), not a real image. */
const isRealFloorPlanPath = (path) => {
  if (!path || typeof path !== "string") return false;
  const normalized = path.trim().toLowerCase();
  if (!normalized) return false;
  // Stored filename or full URL pointing at the default placeholder
  if (normalized === "noimage.png" || normalized.endsWith("/noimage.png")) {
    return false;
  }
  return true;
};

/**
 * Formats a venue document into a public-friendly JSON response.
 * Omits floorPlan when it is null/empty/placeholder so clients only get real images.
 *
 * @param {Object} obj - Mongoose doc or plain object
 * @param {Object} options - optional settings: { timezone, includeFields, excludeFields }
 */
const formatVenue = (obj, options = {}) => {
  if (!obj) return null;
  let venue = JSON.parse(JSON.stringify(obj));
  if (isRealFloorPlanPath(venue.floorPlan)) {
    venue.floorPlan = getFullImageUrl(venue.floorPlan);
  } else {
    delete venue.floorPlan;
  }
  return venue;
};



module.exports = {
  formatVenue,
};
