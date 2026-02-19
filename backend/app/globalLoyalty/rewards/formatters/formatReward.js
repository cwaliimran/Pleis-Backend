const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");
const { formatEventSchedule } = require("../../../events/formatter/eventFormatter");

function formatReward(reward, timezone) {
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
      if (obj?.customReward) {
        obj.customReward.image = getFullImageUrl(obj.customReward.image);
      }
      break;
    case "globalTicketReward":
      if (obj?.event?.basicInfo?.media?.name) {
        obj.event.basicInfo.media.name = getFullImageUrl(obj.event.basicInfo?.media.name);
      }
      if (obj?.event?.schedule) {
        obj.event.schedule = formatEventSchedule(obj.event.schedule, timezone);
      }
      break;
  }

  return obj;
}

module.exports = { formatReward };
