const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

/**
 * Formats the `object` field inside BannerControls dynamically
 * depending on its type and model.
 *
 * @param {Object} obj - Populated `object` document
 * @param {String} type - The type field ("Event", "Organizer", "LoyaltyProgram", etc.)
 * @returns {Object|null}
 */
function formatVenueType(item) {
    let obj = typeof item.toObject === "function" ? item.toObject() : item;

    if (!obj) return null;

    obj.image = getFullImageUrl(obj.image);


    return obj;
}

module.exports = { formatVenueType };
