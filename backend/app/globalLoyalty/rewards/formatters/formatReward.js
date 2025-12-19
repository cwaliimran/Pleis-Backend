const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");

function formatReward(reward) {
  const obj = { ...reward };

  if (obj?.tierLimit?.image) {
    obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
  } else if (obj?.tierLimit) {
    obj.tierLimit.image = getFullImageUrl("noimage.png");
  }

  if (obj?.menuItem?.image) {
    obj.menuItem.image = getFullImageUrl(obj.menuItem.image);
  }

  if (obj?.image) {
    obj.image = getFullImageUrl(obj.image);
  }

  if (obj?.category?.image) {
    obj.category.image = getFullImageUrl(obj.category.image);
  }


  switch (obj.rewardType) {
    case "globalCustomReward":
      obj.customReward.image = getFullImageUrl(obj.customReward?.image);
      break;

  }

  return obj;
}

module.exports = { formatReward };
