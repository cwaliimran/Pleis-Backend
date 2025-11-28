const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");

// utils/formatLoyaltyListing.js
function formatLoyaltyListing(challenge, timezone) {
    const obj = { ...challenge };
    obj.profileIcon = getFullImageUrl(obj.profileIcon || "noimage.png");
    return obj;
}

module.exports = formatLoyaltyListing;
