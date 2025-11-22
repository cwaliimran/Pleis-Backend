const { getFullImageUrl } = require("@utils/imageHelper");

function formatUserWallet(item) {
  if (!item) return null;

  // Handle both Mongoose doc and plain object
  const obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (obj.global?.level?.image) {
    obj.global.level.image = getFullImageUrl(obj.global.level.image);
  } else if (obj.global?.level) {
    obj.global.level.image = getFullImageUrl("noimage.png");
  }
  if (obj.global?.nextStatusLevel?.image) {
    obj.global.nextStatusLevel.image = getFullImageUrl(obj.global.nextStatusLevel.image);
  } else if (obj.global?.nextStatusLevel) {
    obj.global.nextStatusLevel.image = getFullImageUrl("noimage.png");
  }

  return obj;

}

/**
 * Safe formatter for arrays of streaks
 */
function formatUserWallets(streaks = []) {
  return streaks.map(formatUserWallet);
}

module.exports = { formatUserWallet, formatUserWallets };