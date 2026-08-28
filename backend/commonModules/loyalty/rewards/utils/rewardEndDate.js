const { getStartAndEndOfDay } = require("../../../../helperUtils/responseUtil");

const isRewardEndDateExpired = (endDate, now = new Date(), timezone = "UTC") => {
  if (!endDate) return false;
  const { end } = getStartAndEndOfDay(endDate, timezone);
  return now > end;
};

const isStartDateNotReached = (startDate, now = new Date(), timezone = "UTC") => {
  if (!startDate) return false;
  const { start } = getStartAndEndOfDay(startDate, timezone);
  return now < start;
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

const getActivePromotionDateQuery = (timezone = "UTC") => {
  const { start, end } = getStartAndEndOfDay(new Date(), timezone);
  return {
    $and: [
      {
        $or: [
          { endDate: null },
          { endDate: { $gte: start } },
        ],
      },
      {
        $or: [
          { startDate: null },
          { startDate: { $lte: end } },
        ],
      },
    ],
  };
};

module.exports = {
  isRewardEndDateExpired,
  getActiveRewardEndDateQuery,
  isEndDateExpired: isRewardEndDateExpired,
  getActiveEndDateQuery: getActiveRewardEndDateQuery,
  isStartDateNotReached,
  getActivePromotionDateQuery,
};
