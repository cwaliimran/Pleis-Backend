const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");
const {
  convertUtcToTimezone,
} = require("../../../../helperUtils/responseUtil");

// utils/formatReward.js
function formatReward(reward, timezone) {
  let obj = { ...reward };

  if (obj.endDate) {
    obj.endDate = convertUtcToTimezone(obj.endDate, timezone, "YYYY-MM-DD");
  }

  //attach full image URL
  if (obj?.image) {
    obj.image = getFullImageUrl(obj.image);
  }
  if (obj?.tierLimit?.image) {
    obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
  }

  // Conversion = Redeemed / Claims
  const conversion = obj.claimed
    ? Number((((obj.redeemed || 0) / obj.claimed) * 100).toFixed(2))
    : 0;
  const redemptionRate = obj.claimLimit
    ? Number((((obj.redeemed || 0) / obj.claimLimit) * 100).toFixed(2))
    : 0;

  // Items not available as a reward are only claimable via challenges,
  // so Views / Favorites / Conversion aren't meaningful for them
  if (obj.availableAsReward === false) {
    obj.views = "—";
    obj.favoritesCount = "—";
    obj.conversion = "—";
    obj.redemptionRate = "—";
  } else {
    obj.conversion = conversion;
    obj.redemptionRate = redemptionRate;
  }

  // Adjust obj properties based on rewardType
  switch (obj.rewardType) {
    case "buyMenuItemReward":
      delete obj.event;
      delete obj.customReward;
      break;

    case "ticketReward":
      delete obj.menuItem;
      delete obj.customReward;
      break;
  }

  return obj;
}
module.exports = formatReward;
