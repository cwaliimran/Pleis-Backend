const { getFullImageUrl } = require("@utils/imageHelper");
const { convertUtcToTimezone } = require("@utils/responseUtil");

/**
 * Formats the `object` field inside BannerControls dynamically
 * depending on its type and model.
 *
 * @param {Object} obj - Populated `object` document
 * @param {String} type - The type field ("Event", "Organizer", "LoyaltyProgram", etc.)
 * @returns {Object|null}
 */
function formatLoyaltyRewardOrders(item) {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (!obj) return null;

  // Format image URL
  if (obj.snapshot) {
    obj.snapshot.image = getFullImageUrl(obj.snapshot.image || "noimage.png");
    if (
      obj.snapshot.reward &&
      obj.snapshot.reward.customReward
    ) {
      obj.snapshot.reward.customReward.media = getFullImageUrl(
        obj.snapshot.reward.customReward.image || "noimage.png"
      );
    }
  }

  return obj;
}

module.exports = { formatLoyaltyRewardOrders };
