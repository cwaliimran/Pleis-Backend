const { getFullImageUrl } = require("@utils/imageHelper");

function formatUserWallet(item) {
  if (!item) return null;

  const obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (obj?.companyOrganizer) {
    obj.companyOrganizer.profileIcon = getFullImageUrl(obj.companyOrganizer.profileIcon || "noimage.png");
  }

  // Normalize image URLs
  if (obj?.level) {
    obj.level.image = getFullImageUrl(obj.level.image || "noimage.png");
  }
  if (obj?.nextTier) {
    obj.nextTier.image = getFullImageUrl(obj.nextTier.image || "noimage.png");
  }

  // If obj.tierKey provided → return only specific tier values
  if (obj.tierKey && obj.level) {

    const current = obj.level[obj.tierKey];

    obj.level = {
      title: obj.level.title,
      image: obj.level.image,
      entryPoints: current?.entryPoints ?? null,
      retainPoints: current?.retainPoints ?? null
    };
  }
  if (obj.tierKey && obj.nextTier) {
    const next = obj.nextTier[obj.tierKey];
    obj.nextTier = {
      title: obj.nextTier.title,
      image: obj.nextTier.image,
      entryPoints: next?.entryPoints ?? null,
      retainPoints: next?.retainPoints ?? null
    };
  }

  return obj;
}


/**
 * Safe formatter for arrays of items
 */
function formatUserWallets(items = []) {
  return items.map(formatUserWallet);
}

module.exports = { formatUserWallet, formatUserWallets };