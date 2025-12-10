const { getFullImageUrl } = require("@utils/imageHelper");

function formatTransactionItem(item) {
  if (!item) return null;

  // Convert mongoose doc → plain object
  const obj = typeof item.toObject === "function" ? item.toObject() : { ...item };

  // Normalize images for companyOrganizer
  if (obj.companyOrganizer) {
    obj.companyOrganizer.profileIcon = getFullImageUrl(obj.companyOrganizer.profileIcon || "noimage.png");
  }

  // Normalize images for level
  if (obj.level) {
    obj.level.image = getFullImageUrl(obj.level.image || "noimage.png");
  }

  // Normalize images for nextTier
  if (obj.nextTier) {
    obj.nextTier.image = getFullImageUrl(obj.nextTier.image || "noimage.png");
  }

  // 🎯 Apply tierKey filtering (essential / preferred / premier)
  if (obj.tierKey && obj.level) {
    const selectedLevel = obj.level[obj.tierKey] || {};

    obj.level = {
      title: obj.level.title,
      image: obj.level.image,
      entryPoints: selectedLevel.entryPoints ?? null,
      retainPoints: selectedLevel.retainPoints ?? null
    };
  }

  if (obj.tierKey && obj.nextTier) {
    const selectedNextLevel = obj.nextTier[obj.tierKey] || {};

    obj.nextTier = {
      title: obj.nextTier.title,
      image: obj.nextTier.image,
      entryPoints: selectedNextLevel.entryPoints ?? null,
      retainPoints: selectedNextLevel.retainPoints ?? null
    };
  }

  return obj;
}

function formatTransactionItems(items = []) {
  return items.map(formatTransactionItem);
}

module.exports = { formatTransactionItem, formatTransactionItems };
