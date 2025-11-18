const { getFullImageUrl } = require("@utils/imageHelper");

function formatSuggestedClubOrganization(item) {
  let org = typeof item.toObject === "function" ? item.toObject() : item;

  if (!org) return null;

  delete org.__v;

  // Handle media transformation for aggregation structure
  if (org.basicInfo?.media?.logo) {
    org.basicInfo.media = getFullImageUrl(org.basicInfo.media.logo);
  }

  return org;
}


module.exports = { formatSuggestedClubOrganization };
