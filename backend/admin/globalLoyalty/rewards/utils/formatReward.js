const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");

// utils/formatReward.js
function formatReward(reward, timezone) {


  // Spread clone
  let obj = { ...reward };

  // -----------------------------
  // 1) Map globalRewardType -> rewardType
  // -----------------------------
  const rewardTypeMap = {
    GlobalTicketReward: "ticketReward",
    GlobalCustomReward: "customReward",
  };

  obj.rewardType = rewardTypeMap[obj.globalRewardType] || obj.globalRewardType;

  // Remove the internal field from API response
  delete obj.globalRewardType;

  // -----------------------------
  // 2) Attach full image URLs
  // -----------------------------
  if (obj?.image) {
    obj.image = getFullImageUrl(obj.image);
  }

  if (obj?.tierLimit?.image) {
    obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
  }

  // -----------------------------
  // 3) Format based on rewardType
  // -----------------------------
  switch (obj.rewardType) {
    case "customReward":
      // Remove irrelevant fields
      delete obj.menuItem;
      delete obj.event;

      // Convert image inside customReward
      if (obj.customReward?.image) {
        obj.customReward.media = getFullImageUrl(obj.customReward.image);
      }
      break;

    case "ticketReward":
      delete obj.menuItem;
      delete obj.customReward;
      break;
  }

  return obj;
}


module.exports = formatReward;
