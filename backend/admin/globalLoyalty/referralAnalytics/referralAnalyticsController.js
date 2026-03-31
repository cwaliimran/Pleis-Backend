const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
} = require("../../../helperUtils/responseUtil");

const ReferralAnalyticsService = require("./referralAnalyticsService");
const { ReferralAnalytics_KEYS } = require("./utils/referralAnalyticsKeyMap");



const getReferralAnalytics = async (req, res) => {
  const { dateFilter = "all" } = req.query;
  let { timezone } = req.user || "UTC";

  try {

    if (dateFilter && !validateParams(req, res, {
      enumFields: {
        dateFilter: ["all", "today", "thisWeek", "thisMonth"],
      },
    })) return;

    const ReferralAnalytics = await ReferralAnalyticsService.getReferralAnalytics({
      dateFilter,
      timezone,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ReferralAnalytics_fetched_successfully",
      data: ReferralAnalytics,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};



const getReferralAnalyticsValue = async (req, res) => {
  const {
    key,
    subFilter = "all",
    dateFilter = "all",
  } = req.query;

  const timezone = req.user?.timezone || "UTC";

  // 1. Validate key
  if (!ReferralAnalytics_KEYS[key]) {
    return res.status(400).json({
      message: "Invalid ReferralAnalytics key",
    });
  }

  // 2. Validate subFilter (THIS IS WHERE IT IS USED)
  const isValidSubFilter = ReferralAnalytics_KEYS[key].subFilters.some(
    (f) => f.key === subFilter
  );

  if (!isValidSubFilter) {
    return res.status(400).json({
      message: "Invalid sub filter for given key",
    });
  }

  // 3. Fetch calculated value
  const result = await ReferralAnalyticsService.getReferralAnalyticsValue({
    key,
    subFilter,
    dateFilter,
    timezone,
  });
  
  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "ReferralAnalytics_value_fetched_successfully",
    data: result,
  });
};

const getReferralAnalyticsStats = async (req, res) => {
  const { dateFilter = "all" } = req.query;
  let { timezone } = req.user || "UTC";

  try {

    if (dateFilter && !validateParams(req, res, {
      enumFields: {
        dateFilter: ["all", "today", "thisWeek", "thisMonth"],
      },
    })) return;

    const ReferralAnalytics = await ReferralAnalyticsService.getReferralAnalyticsStats({
      dateFilter,
      timezone,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ReferralAnalytics_stats_fetched_successfully",
      data: ReferralAnalytics,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

module.exports = {
  getReferralAnalytics,
  getReferralAnalyticsValue,
  getReferralAnalyticsStats,
};
