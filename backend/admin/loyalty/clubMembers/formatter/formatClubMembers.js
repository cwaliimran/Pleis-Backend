const { getFullImageUrl } = require("@utils/imageHelper");

function formatClubMembers(item) {
    if (!item) return null;
    let obj = typeof item.toObject === "function" ? item.toObject() : item;

    if (!obj) return null;

    // Format image URL
    obj.user.profileIcon = getFullImageUrl(obj.user.profileIcon || "noimage.png");

    return obj;
}

module.exports = formatClubMembers;
