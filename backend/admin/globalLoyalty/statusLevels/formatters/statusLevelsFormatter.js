const { getFullImageUrl } = require("@utils/imageHelper");

/**
 * Formats a StatusLevels document or plain object into API-friendly shape
 */
function statusLevelsFormatter(item) {
    if (!item) return null;

    const obj = typeof item.toObject === "function" ? item.toObject() : { ...item };

    obj.image = getFullImageUrl(obj.image || "noimage.png");
        obj.backgroundImage = getFullImageUrl(obj.backgroundImage || "noimage.png");


    return obj;
}

module.exports = { statusLevelsFormatter };