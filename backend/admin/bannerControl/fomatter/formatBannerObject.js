const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

/**
 * Formats the `object` field inside BannerControls dynamically
 * depending on its type and model.
 *
 * @param {Object} obj - Populated `object` document
 * @param {String} type - The type field ("Event", "Organizer", "LoyaltyProgram", etc.)
 * @returns {Object|null}
 */
function formatBannerObject(item) {
    let obj = typeof item.toObject === "function" ? item.toObject() : item;

    if (!obj) return null;

    let refObject = obj.object;
    if (!refObject) return obj;
    switch (obj.type) {
        case "Event":
            refObject.basicInfo.media = getFullImageUrl(refObject.basicInfo.media?.name)
            break;

        //TODO loyalty program case when model is defined
        case "Organizer":
        case "LoyaltyProgram":
            refObject.profileIcon = getFullImageUrl(refObject.profileIcon)
            break;

        default: null
    }

    return obj;
}

module.exports = { formatBannerObject };
