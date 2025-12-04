const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");
const { convertUtcToTimezone } = require("../../../../helperUtils/responseUtil");

// utils/formatReward.js
function formatReward(reward, timezone) {
    let obj = { ...reward };

    if (obj.endDate) {
        obj.endDate = convertUtcToTimezone(obj.endDate, timezone, "YYYY-MM-DD");
    }


    //attach full image URL
    if (obj?.image) {
        obj.image = getFullImageUrl(obj.image)
    }
    if (obj?.tierLimit?.image) {
        obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
    }


    // Adjust obj properties based on rewardType
    switch (obj.rewardType) {
        case "customReward":
            delete obj.menuItem;
            delete obj.event;
            obj.customReward.media = getFullImageUrl(obj.customReward?.image);
            break;

        case "buyMenuItemReward":
            delete obj.event;
            delete obj.customReward;
            break;

        case "ticketReward":
            delete obj.menuItem;
            delete obj.customReward;
            break;
    }

    return obj;
}

module.exports = formatReward;
