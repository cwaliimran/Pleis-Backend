const { getFullImageUrl } = require("@utils/imageHelper");

function formatUserWallet(item) {
  if (!item) return null;

  const obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (obj?.companyOrganizer && obj.companyOrganizer.companyDetails?.logo) {
    obj.companyOrganizer.companyDetails.logo = getFullImageUrl(obj.companyOrganizer.companyDetails.logo || "noimage.png");
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
      bonusPointsPerEuro: obj.level.bonusPointsPerEuro,
      entryPoints: current?.entryPoints ?? null,
      retainPoints: current?.retainPoints ?? null,
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

function formatLoyaltyProfile(profile) {
  if (!profile) return null;

  const obj = typeof profile.toObject === "function" ? profile.toObject() : profile;

  // Normalize image URLs
  obj.logo = getFullImageUrl(obj.logo || "noimage.png");
  obj.coverImage = getFullImageUrl(obj.coverImage || "noimage.png");
  if (obj.category) {
    obj.category.image = getFullImageUrl(obj.category.image || "noimage.png");
  }

  return obj;
}

module.exports = { formatUserWallet, formatUserWallets, formatLoyaltyProfile };