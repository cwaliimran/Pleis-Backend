const { getFullImageUrl } = require("@utils/imageHelper");

function formatSuggestedClub(item) {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (!obj) return null;

  delete obj.__v;

  // Always return a usable logo URL. The fallback used to sit inside an
  // `if (logo)` check, so clubs without a logo got none (empty circle in the
  // app) instead of noimage.png. getFullImageUrl returns noimage.png for an
  // empty path and leaves absolute URLs as they are.
  obj.companyDetails = {
    ...(obj.companyDetails || {}),
    logo: getFullImageUrl(obj.companyDetails?.logo),
  };

   // distance formatting (meters → km)
  if (item.distance !== undefined && item.distance !== null) {
    const meters = Number(item.distance);
    if (Number.isFinite(meters)) {
      const km = meters / 1000;

      obj.distance = {
        distance: Number(km.toFixed(2)),
        unit: "km",
      };
    }
  }


  return obj;
}


module.exports = { formatSuggestedClub };
