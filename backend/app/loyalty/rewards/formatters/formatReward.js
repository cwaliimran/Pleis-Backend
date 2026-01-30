const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");

// utils/formatReward.js
function formatReward(reward) {
    const obj = { ...reward };

    // Attach full image URL for company logo if present
if (obj?.companyOrganizer?.companyDetails) {
    // Check if logo exists
    if (obj.companyOrganizer.companyDetails.logo) {
        obj.companyOrganizer.companyDetails.logo = getFullImageUrl(obj.companyOrganizer.companyDetails.logo);
    } else {
        obj.companyOrganizer.companyDetails.logo = getFullImageUrl("noimage.png");
    }
}


    if (obj?.tierLimit?.image) {
        obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
    } else {
        obj.tierLimit.image = getFullImageUrl("noimage.png");
    }

    if (obj?.menuItem?.image) {
        obj.menuItem.image = getFullImageUrl(obj.menuItem.image);
    }

    if (obj?.image) {
        obj.image = getFullImageUrl(obj.image);
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



    return obj;
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



module.exports = { formatReward, formatSingleRewardByTierKey };
