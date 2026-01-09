const { getFullImageUrl } = require("@utils/imageHelper");

function formatqr(item) {
    if (!item) return null;
    let obj = typeof item.toObject === "function" ? item.toObject() : item;

    if (!obj) return null;

    // Format image URL
    obj.image = getFullImageUrl(obj.image || "noimage.png");

    return obj;
}

module.exports = formatqr;
