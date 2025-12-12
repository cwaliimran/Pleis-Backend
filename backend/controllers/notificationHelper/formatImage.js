const { getFullImageUrl } = require("../../helperUtils/imageHelper");

// utils/formatLoyaltyListing.js
function formatImage(challenge, timezone) {
    const obj = { ...challenge };
    obj.subject.profileIcon = getFullImageUrl(obj.subject.profileIcon || "noimage.png");
     obj.receiver.profileIcon = getFullImageUrl(obj.receiver.profileIcon || "noimage.png");
    return obj;
}

module.exports = formatImage;
