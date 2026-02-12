const { getFullImageUrl } = require("@utils/imageHelper");
const { convertUtcToTimezone } = require("@utils/responseUtil");

const formatGlobalChallenge = (challenge, timezone) => {
  const obj = { ...challenge };

  if (obj?.image) {
    obj.image = getFullImageUrl(obj.image);
  }

  if (obj.tierLimit?.image) {
    obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
  }

  if (obj.reward?.customReward?.image) {
    obj.reward.customReward.image = getFullImageUrl(obj.reward.customReward.image);
  }

  if (obj.endDate && timezone) {
    obj.endDate = convertUtcToTimezone(
      obj.endDate,
      timezone,
      "YYYY-MM-DD"
    );
  }
if (obj.reward) {
  const {
    rewardType,
    rewardValue,
    customReward,
    specialTicket
  } = obj.reward;

  switch (rewardType) {
    case "points":
      obj.reward = {
        rewardType,
        rewardValue
      };
      break;

    case "customReward":
      obj.reward = {
        rewardType,
        customReward
      };
      break;

    case "specialTicket":
      obj.reward = {
        rewardType,
        specialTicket
      };
      break;

    default:
      break;
  }
}


  return obj;
};

module.exports = formatGlobalChallenge;
