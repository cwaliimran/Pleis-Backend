const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");
const { formatEventSchedule } = require("../../../events/formatter/eventFormatter");

function formatReward(reward, timezone) {
    const obj = { ...reward };

    // Safely handle company logo (checking existence of all necessary properties)
    if (obj?.companyOrganizer?.companyDetails) {
        if (obj.companyOrganizer.companyDetails.logo) {
            obj.companyOrganizer.companyDetails.logo = getFullImageUrl(obj.companyOrganizer?.companyDetails?.logo);
        } else {
            obj.companyOrganizer.companyDetails.logo = getFullImageUrl("noimage.png");
        }
    }

    // Safely handle tier limit image (check if tierLimit and image exist)
    if (obj?.tierLimit) {
        if (obj.tierLimit?.image) {
            obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
        } else {
            obj.tierLimit.image = getFullImageUrl("noimage.png");
        }
    }

    // Safely handle menuItem image (check if menuItem and image exist)
    if (obj?.menuItem?.image) {
        obj.menuItem.image = getFullImageUrl(obj.menuItem.image);
    } else if (obj?.menuItem) {
        // If menuItem exists but no image, set default image
        obj.menuItem.image = getFullImageUrl("noimage.png");
    }

    // Safely handle the main image of the reward
    if (obj?.image) {
        obj.image = getFullImageUrl(obj.image);
    } else {
        obj.image = getFullImageUrl("noimage.png");
    }

    // Adjust obj properties based on rewardType
    switch (obj.rewardType) {
        case "customReward":
            // Ensure customReward exists before trying to access its properties
            if (obj.customReward) {
                delete obj.menuItem;  // Remove menuItem if it's a custom reward
                delete obj.event;     // Remove event if it's a custom reward

                // Check if customReward.image exists
                if (obj.customReward?.image) {
                    obj.customReward.image = getFullImageUrl(obj.customReward.image);
                } else {
                    obj.customReward.image = getFullImageUrl("noimage.png");  // Fallback to default image
                }
            }
            break;

        case "buyMenuItemReward":
            delete obj.event;  // Remove event if it's a buyMenuItemReward
            delete obj.customReward;  // Remove customReward if it's a buyMenuItemReward
            break;

        case "ticketReward":
            delete obj.menuItem;  // Remove menuItem if it's a ticketReward
            delete obj.customReward;  // Remove customReward if it's a ticketReward
            if (obj?.event?.basicInfo?.media?.name) {
                obj.event.basicInfo.media.name = getFullImageUrl(obj.event.basicInfo?.media.name);
            }
            if (obj?.event?.schedule) {
                obj.event.schedule = formatEventSchedule(obj.event.schedule, timezone);
            }
            break;
    }

    return obj;  // Correct closing brace here for formatReward function
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
