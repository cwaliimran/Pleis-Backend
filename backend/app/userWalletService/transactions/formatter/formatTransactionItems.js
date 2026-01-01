
const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");
const { convertUtcToTimezone } = require("../../../../helperUtils/responseUtil");

// utils/formatReward.js
function formatTransactionItem(item) {
    let obj = { ...item };

    // attach full logo URL if organization and logo exist
    if (obj?.organization?.basicInfo?.media?.logo) {
      obj.organization.basicInfo.media.logo = getFullImageUrl(obj.organization.basicInfo.media.logo);
    }

    if (obj?.companyOrganizer?.companyDetails?.logo) {
        obj.companyOrganizer.companyDetails.logo = getFullImageUrl(obj.companyOrganizer.companyDetails.logo);
    }

    return obj;
}

module.exports = {formatTransactionItem};
