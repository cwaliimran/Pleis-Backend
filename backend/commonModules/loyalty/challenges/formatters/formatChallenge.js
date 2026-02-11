const { tiersFormatter } = require("../../../../admin/tiers/formatters/tiersFormatter");
const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");
const { convertUtcToTimezone } = require("../../../../helperUtils/responseUtil");

// utils/formatChallenge.js
function formatChallenge(challenge, timezone) {
    const obj = { ...challenge };
    if (obj?.companyOrganizer?.profileIcon) {
        obj.companyOrganizer.profileIcon = getFullImageUrl(obj.companyOrganizer.profileIcon);
    }
    if (obj?.companyOrganizer?.companyDetails?.logo) {
        obj.companyOrganizer.companyDetails.logo = getFullImageUrl(obj.companyOrganizer?.companyDetails?.logo);
    }
    if (obj?.image) {
        obj.image = getFullImageUrl(obj.image);
    } else {
        //noimage.png
        obj.image = getFullImageUrl("noimage.png");
    }

    // If tierLimit is an object with an 'image' property, format it; otherwise, leave as is (likely ObjectId)
    if (
        obj?.tierLimit &&
        typeof obj.tierLimit === "object"
    ) {
        obj.tierLimit = tiersFormatter(obj.tierLimit);
    }

    if (obj.reward) {
        switch (obj.reward.rewardType) {
            case "points":
            case "specialTicket":
                delete obj.reward.rewardMenuItem;
                delete obj.reward.customReward;
                break;
            case "menuItem":
                delete obj.reward.rewardValue;
                delete obj.reward.customReward;
                delete obj.reward.specialTicket;
                if(obj.reward.rewardMenuItem && obj.reward.rewardMenuItem.image){
                    obj.reward.rewardMenuItem.image = getFullImageUrl(obj.reward.rewardMenuItem.image)
                }
                break;
            case "customReward":
                delete obj.reward.rewardValue;
                delete obj.reward.rewardMenuItem;
                // attach full image URL
                if (obj.reward.customReward?.image) {
                    obj.reward.customReward.media = getFullImageUrl(obj.reward.customReward.image)
                }
                delete obj.reward.customReward?.image;
                break;
        }
    }

    switch (obj.taskType) {
        case "visit":
            delete obj.taskMenuItem;
            break;
        case "earnPoints":
            delete obj.taskMenuItem;
            break;
        case "buyMenuItem":
            // delete obj.taskValue;
            if(obj.taskMenuItem && obj.taskMenuItem.image){
                obj.taskMenuItem.image = getFullImageUrl(obj.taskMenuItem.image)
            }
            break;
        case "referUsers":
            delete obj.taskMenuItem;
            break;
    }

    if (obj.endDate && timezone) {
        obj.endDate = convertUtcToTimezone(obj.endDate, timezone, "YYYY-MM-DD");
    }

    return obj;
}

module.exports = formatChallenge;
