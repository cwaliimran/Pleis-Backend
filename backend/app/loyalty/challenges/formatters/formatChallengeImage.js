const { getFullImageUrl } = require("@utils/imageHelper");

function formatChallengeDetails(challenge) {
  return {
    ...challenge,
    image: getFullImageUrl(challenge.image),
  };
}

module.exports = {
  formatChallengeDetails,
};
