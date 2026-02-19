
const { getFullImageUrl } = require("@utils/imageHelper");

// utils/formatReward.js
function formatTransactionItem(item) {
    let obj = { ...item };

    // attach full logo URL if organization and logo exist
    if (obj?.organization?.basicInfo?.media?.logo) {
      obj.organization.basicInfo.media.logo = getFullImageUrl(obj.organization.basicInfo.media.logo);
    }
    if (obj?.user?.profileIcon) {
      obj.user.profileIcon = getFullImageUrl(obj.user.profileIcon);
    }
    if (obj?.companyOrganizer?.logo) {
      obj.companyOrganizer.logo = getFullImageUrl(obj.companyOrganizer.logo);
    }

    return obj;
}

module.exports = {formatTransactionItem};
