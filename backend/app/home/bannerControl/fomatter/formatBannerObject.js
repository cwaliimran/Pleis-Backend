const { getFullImageUrl } = require("@utils/imageHelper");

/**
 * Formats the `object` field inside BannerControls dynamically
 * depending on its type and model.
 *
 * @param {Object} obj - Populated `object` document
 * @param {String} type - The type field ("Event", "Organizer", "LoyaltyProgram", etc.)
 * @returns {Object|null}
 */
function formatBannerObject(item) {
    let refObject = typeof item.toObject === "function" ? item.toObject() : item;
    if (!refObject) return null;
    switch (refObject.type) {
        case "Event":
            refObject.image = getFullImageUrl(refObject.image)
            break;

        case "Organizer":
        case "LoyaltyProgram":
            refObject.image = getFullImageUrl(refObject.image)
            break;
        case "Other":
            refObject.image = getFullImageUrl(refObject.image)
            break;
        default: null
    }

    return refObject;
}

module.exports = { formatBannerObject };
