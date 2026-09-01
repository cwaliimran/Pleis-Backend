const { getFullImageUrl } = require("@utils/imageHelper");

const formatMenuItemImage = (item) => {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    image: getFullImageUrl(item.image || "noimage.png"),
  };
};

function formatRewardDetails(reward) {
  return {
    ...reward,
    image: getFullImageUrl(reward.image),
    menuItem: reward.menuItem ? formatMenuItemImage(reward.menuItem) : reward.menuItem,
    equivalentMenuItems: Array.isArray(reward.equivalentMenuItems)
      ? reward.equivalentMenuItems.map(formatMenuItemImage)
      : reward.equivalentMenuItems,
  };
}

module.exports = {
  formatRewardDetails,
};
