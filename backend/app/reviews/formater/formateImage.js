const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

// utils/formatLoyaltyListing.js
function formatLoyaltyListing(challenge, timezone) {
    const obj = { ...challenge };
    obj.user.profileIcon = getFullImageUrl(obj.user.profileIcon || "noimage.png");
    return obj;
}

module.exports = formatLoyaltyListing;
