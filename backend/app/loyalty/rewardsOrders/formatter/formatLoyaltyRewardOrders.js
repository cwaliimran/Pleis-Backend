const { getFullImageUrl } = require("@utils/imageHelper");

const formatMenuItemImage = (item) => {
  if (!item || typeof item !== "object") return item;
  // Skip bare ObjectIds / unpopulated refs
  if (item.image == null && item.title == null) return item;
  return {
    ...item,
    image: getFullImageUrl(item.image || "noimage.png"),
  };
};

const formatSnapshotMenuItems = (menuItem) => {
  if (menuItem == null) return menuItem;
  const list = Array.isArray(menuItem) ? menuItem : [menuItem];
  return list.map(formatMenuItemImage);
};

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
    if (obj.snapshot.menuItem != null) {
      obj.snapshot.menuItem = formatSnapshotMenuItems(obj.snapshot.menuItem);
    }
    if (
      obj.snapshot.reward &&
      obj.snapshot.reward.customReward
    ) {
      obj.snapshot.reward.customReward.media = getFullImageUrl(
        obj.snapshot.reward.customReward.image || "noimage.png"
      );
    }
  }

  if (Array.isArray(obj.equivalentMenuItems)) {
    obj.equivalentMenuItems = obj.equivalentMenuItems.map(formatMenuItemImage);
  }
  if (Array.isArray(obj.activeEquivalentMenuItems)) {
    obj.activeEquivalentMenuItems = obj.activeEquivalentMenuItems.map(
      formatMenuItemImage
    );
  }

  // Attach company logo URL if available
  if (
    obj.companyOrganizer &&
    obj.companyOrganizer?.companyDetails &&
    obj.companyOrganizer?.companyDetails?.logo
  ) {
    obj.companyOrganizer.companyDetails.logo = getFullImageUrl(obj.companyOrganizer?.companyDetails?.logo || "noimage.png");
  }

  return obj;
}

module.exports = { formatLoyaltyRewardOrders };
