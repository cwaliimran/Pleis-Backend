const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");

// utils/formatReward.js
function formatReward(reward, timezone) {
    const obj = { ...reward };

    //attach full image URL
    if (obj?.image) {
        obj.media = getFullImageUrl(obj.image)
    } else {
        obj.media = getFullImageUrl("noimage.png");
    }


    if (obj?.tierLimit?.image) {
        obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
    } else {
        obj.tierLimit.image = getFullImageUrl("noimage.png");
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

    //remove image
    delete obj.image;

    return obj;
}


function formatRewardsByTierKey(groupedRewards = [], tierKey) {
    return groupedRewards.map(group => ({
        ...group,
        items: group.items.map(item =>
            formatSingleRewardByTierKey({ ...item }, tierKey)
        ),
    }));
}

function formatSingleRewardByTierKey(item, tierKey) {
    if (!tierKey || !item?.tierLimit) return item;

    const { essential, preferred, premier, ...restTier } = item.tierLimit;
    const current = item.tierLimit[tierKey];

    item.tierLimit = {
        ...restTier,
        entryPoints: current?.entryPoints ?? null,
        retainPoints: current?.retainPoints ?? null,
    };

    delete item.tierLimit.createdAt;
    delete item.tierLimit.updatedAt;
    delete item.tierLimit.status;
    delete item.tierLimit.__v;

    return item;
}



module.exports = { formatReward, formatRewardsByTierKey };
