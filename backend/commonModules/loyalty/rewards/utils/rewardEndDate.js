const { getStartAndEndOfDay } = require("../../../../helperUtils/responseUtil");

const isRewardEndDateExpired = (endDate, now = new Date(), timezone = "UTC") => {
  if (!endDate) return false;
  const { end } = getStartAndEndOfDay(endDate, timezone);
  return now > end;
};

const getActiveRewardEndDateQuery = (timezone = "UTC") => {
  const { start } = getStartAndEndOfDay(new Date(), timezone);
  return {
    $or: [
      { endDate: null },
      { endDate: { $gte: start } },
    ],
  };
};

module.exports = {
  isRewardEndDateExpired,
  getActiveRewardEndDateQuery,
};
