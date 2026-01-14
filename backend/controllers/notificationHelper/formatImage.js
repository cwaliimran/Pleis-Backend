const { getFullImageUrl } = require("../../helperUtils/imageHelper");

// utils/formatLoyaltyListing.js
function formatImage(challenge, timezone) {

    const obj = { ...challenge };

    // Safely handle potential null/undefined subject or receiver
    if (obj.subject) {
        obj.subject.profileIcon = getFullImageUrl(obj.subject.profileIcon || "noimage.png");
    }

    if (obj.receiver) {
        obj.receiver.profileIcon = getFullImageUrl(obj.receiver.profileIcon || "noimage.png");
    }

    return obj;
}
module.exports = formatImage;
