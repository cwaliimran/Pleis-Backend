const { getFullImageUrl } = require("@utils/imageHelper");

function formatSuggestedClub(item) {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (!obj) return null;

  delete obj.__v;

 if (obj?.companyDetails && obj.companyDetails?.logo) {
    obj.companyDetails.logo = getFullImageUrl(obj.companyDetails.logo || "noimage.png");
  }


  return obj;
}


module.exports = { formatSuggestedClub };
