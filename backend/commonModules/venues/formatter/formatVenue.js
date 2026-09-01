const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

/**
 * Formats an event document into a public-friendly JSON response.
 * Handles populated fields, media URLs, and timezone-aware date conversion.
 *
 * @param {Object} obj - Mongoose doc or plain object
 * @param {Object} options - optional settings: { timezone, includeFields, excludeFields }
 */
const formatVenue = (obj, options = {}) => {
  if (!obj) return null;
  let venue = JSON.parse(JSON.stringify(obj));
  venue.floorPlan = getFullImageUrl(venue.floorPlan || "noimage.png");
  return venue;
};



module.exports = {
  formatVenue,
};
