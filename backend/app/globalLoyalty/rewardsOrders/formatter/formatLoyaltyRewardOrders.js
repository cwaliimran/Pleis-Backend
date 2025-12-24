const { getFullImageUrl } = require("@utils/imageHelper");

/**
 * Formats the `object` field inside BannerControls dynamically
 * depending on its type and model.
 *
 * @param {Object} obj - Populated `object` document
 * @param {String} type - The type field ("Event", "Organizer", "LoyaltyProgram", etc.)
 * @returns {Object|null}
 */
function formatGlobalLoyaltyRewardOrder(item) {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (!obj) return null;

  // Format image URL
  if (obj.snapshot) {
    obj.snapshot.image = getFullImageUrl(obj.snapshot.image || "noimage.png");
    if (
      obj.snapshot &&
      obj.snapshot.customReward
    ) {
      obj.snapshot.customReward.image = getFullImageUrl(
        obj.snapshot.customReward.image || "noimage.png"
      );
    }
  }

  return obj;
}

module.exports = { formatGlobalLoyaltyRewardOrder };
