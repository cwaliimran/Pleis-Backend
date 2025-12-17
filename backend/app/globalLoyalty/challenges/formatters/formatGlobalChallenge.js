const { getFullImageUrl } = require("@utils/imageHelper");
const { convertUtcToTimezone } = require("@utils/responseUtil");

const formatGlobalChallenge = (challenge, timezone) => {
  const obj = { ...challenge };

  if (obj.image) {
    obj.image = getFullImageUrl(obj.image);
  }

  if (obj.tierLimit?.image) {
    obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
  }

  if (obj.endDate && timezone) {
    obj.endDate = convertUtcToTimezone(
      obj.endDate,
      timezone,
      "YYYY-MM-DD"
    );
  }

  return obj;
};

module.exports = formatGlobalChallenge;
