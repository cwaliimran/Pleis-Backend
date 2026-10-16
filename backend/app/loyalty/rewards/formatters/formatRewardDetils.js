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

const formatMenuItems = (menuItem) => {
  if (menuItem == null) return menuItem;
  if (Array.isArray(menuItem)) return menuItem.map(formatMenuItemImage);
  return [formatMenuItemImage(menuItem)];
};

function formatRewardDetails(reward) {
  const formatted = {
    ...reward,
    image: getFullImageUrl(reward.image || "noimage.png"),
    menuItem: formatMenuItems(reward.menuItem),
    equivalentMenuItems: Array.isArray(reward.equivalentMenuItems)
      ? reward.equivalentMenuItems.map(formatMenuItemImage)
      : reward.equivalentMenuItems,
  };

  if (formatted.companyOrganizer?.companyDetails) {
    formatted.companyOrganizer = {
      ...formatted.companyOrganizer,
      companyDetails: {
        ...formatted.companyOrganizer.companyDetails,
        logo: getFullImageUrl(
          formatted.companyOrganizer.companyDetails.logo || "noimage.png"
        ),
      },
    };
  }

  if (formatted.tierLimit?.image != null || formatted.tierLimit) {
    formatted.tierLimit = {
      ...formatted.tierLimit,
      image: getFullImageUrl(formatted.tierLimit?.image || "noimage.png"),
    };
  }

  if (formatted.customReward) {
    formatted.customReward = {
      ...formatted.customReward,
      image: getFullImageUrl(formatted.customReward.image || "noimage.png"),
    };
  }

  return formatted;
}

module.exports = {
  formatRewardDetails,
};
