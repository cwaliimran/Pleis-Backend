const { getFullImageUrl } = require("@utils/imageHelper");

function formatRewardDetails(reward) {
  return {
    ...reward,
    image: getFullImageUrl(reward.image),
  };
}

module.exports = {
  formatRewardDetails,
};
