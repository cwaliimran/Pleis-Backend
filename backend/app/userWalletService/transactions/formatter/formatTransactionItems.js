
const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");
const { convertUtcToTimezone } = require("../../../../helperUtils/responseUtil");

// utils/formatReward.js
function formatTransactionItem(item) {
    let obj = { ...item };

    // attach full logo URL if organization and logo exist
    if (obj?.organization?.basicInfo?.media?.logo) {
      obj.organization.basicInfo.media.logo = getFullImageUrl(obj.organization.basicInfo.media.logo);
    }

    return obj;
}

module.exports = {formatTransactionItem};
