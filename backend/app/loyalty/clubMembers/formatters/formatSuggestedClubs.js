const { getFullImageUrl } = require("@utils/imageHelper");

function formatSuggestedClub(item) {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (!obj) return null;

  delete obj.__v;

 if (obj?.companyDetails && obj.companyDetails?.logo) {
    obj.companyDetails.logo = getFullImageUrl(obj.companyDetails.logo || "noimage.png");
  }

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
