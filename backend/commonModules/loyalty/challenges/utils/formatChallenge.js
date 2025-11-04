const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");
const { convertUtcToTimezone } = require("../../../../helperUtils/responseUtil");

// utils/formatChallenge.js
function formatChallenge(challenge, timezone) {
    const obj = { ...challenge };

    if (obj?.companyOrganizer?.profileIcon) {
        obj.companyOrganizer.profileIcon = getFullImageUrl(obj.companyOrganizer.profileIcon);
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
                break;
            case "customReward":
                delete obj.reward.rewardValue;
                delete obj.reward.rewardMenuItem;
                //attach full image URL
                if (obj.reward.customReward?.image) {
                    obj.reward.customReward.media = getFullImageUrl(obj.reward.customReward.image)
                }
                delete obj.reward.customReward.image;
                break;
        }
    }

    switch (obj.taskType) {
        case "visit":
            delete obj.taskValue;
            delete obj.taskMenuItem;
            break;
        case "earnPoints":
            delete obj.taskMenuItem;
            break;
        case "buyMenuItem":
            delete obj.taskValue;
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
