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

  //cleanup
    // -----------------------
  // Reward cleanup by taskType
  // -----------------------
  if (obj.reward && obj.taskType) {
    const { rewardType, rewardValue, customReward } = obj.reward;

    switch (obj.taskType) {
      case "globalEarnPoints":
      case "globalVisit":
        obj.reward = {
          rewardType,
          rewardValue
        };
        break;

      case "globalReferUsers":
        obj.reward = {
          rewardType,
          customReward
        };
        break;

      default:
        // keep reward unchanged for future task types
        break;
    }
  }

  return obj;
};

module.exports = formatGlobalChallenge;
