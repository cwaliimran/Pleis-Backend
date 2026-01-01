const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");

// utils/formatReward.js
function formatReward(reward, timezone) {
    const obj = { ...reward };

    //attach full image URL
    if (obj?.image) {
        obj.media = getFullImageUrl(obj.image)
    }
    if (obj?.tierLimit?.image) {
        obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
    }


    // Adjust obj properties based on rewardType
    switch (obj.rewardType) {
        case "customReward":
            delete obj.menuItem;
            delete obj.event;
            obj.customReward.image = getFullImageUrl(obj.customReward?.image);
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

    //remove image
    delete obj.image;

    return obj;
}

module.exports = formatReward;
