const { getFullImageUrl } = require("@utils/imageHelper");
const { convertUtcToTimezone } = require("@utils/responseUtil");
const { attachMenuIds } = require("../../../../shared/menuItems/menuField");

/**
 * Formats the `object` field inside BannerControls dynamically
 * depending on its type and model.
 *
 * @param {Object} obj - Populated `object` document
 * @param {String} type - The type field ("Event", "Organizer", "LoyaltyProgram", etc.)
 * @returns {Object|null}
 */
function formatMenuItem(item, timezone) {
    let obj = typeof item.toObject === "function" ? item.toObject() : item;

    if (!obj) return null;

    // Format image URL
    obj.image = getFullImageUrl(obj.image || "noimage.png");
    
    return attachMenuIds(obj);
}

module.exports = { formatMenuItem };
