const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");

// utils/formatReward.js
function formatReward(reward, timezone) {


  // Spread clone
  let obj = { ...reward };

  // -----------------------------
  // 2) Attach full image URLs
  // -----------------------------
  if (obj?.image) {
    obj.image = getFullImageUrl(obj.image);
  }

  if (obj?.tierLimit?.image) {
    obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
  }

  if (obj?.category?.image) {
    obj.category.image = getFullImageUrl(obj.category.image);
  }


  // -----------------------------
  // 3) Format based on rewardType
  // -----------------------------
  switch (obj.rewardType) {
    case "globalCustomReward":
      // Remove irrelevant fields
      delete obj.menuItem;
      delete obj.event;

      // Convert image inside customReward
      if (obj.customReward?.image) {
        obj.customReward.image = getFullImageUrl(obj.customReward.image);
      }
      break;

  }

  return obj;
}


module.exports = formatReward;
