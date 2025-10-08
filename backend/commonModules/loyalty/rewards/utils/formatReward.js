const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");

// utils/formatReward.js
function formatReward(reward, timezone) {
    const obj = { ...reward };

    //attach full image URL
    if (obj?.image) {
        obj.mediaInfo = {
            image: obj.image,
            url: getFullImageUrl(obj.image),
        };
    }


    // Adjust obj properties based on rewardType
    switch (obj.rewardType) {
        case "customReward":
            delete obj.menuItem;
            delete obj.event;
            //attach mediaInfo for customReward image
            if (obj.customReward?.image) {
                obj.customReward.mediaInfo = {
                    image: obj.customReward.image,
                    url: getFullImageUrl(obj.customReward.image),
                };
            }
            delete obj.customReward.image;
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
