const convertToMongoArray = require("@utils/convertToMongoArray");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
} = require("../../../helperUtils/responseUtil");

const AnalyticsService = require("./analyticsService");
const { Analytics_KEYS } = require("./utils/AnalyticsKeyMap");



const getAnalytics = async (req, res) => {
  let { dateFilter = "all", companyOrganizer,organization } = req.query;
  let { timezone } = req.user || "UTC";
  if(!organization){
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "organization_required",
    });
  }


  try {

    if (dateFilter && !validateParams(req, res, {
      enumFields: {
        dateFilter: ["all", "today", "thisWeek", "thisMonth"],
      },
    })) return;

    const Analytics = await AnalyticsService.getAnalytics({
      dateFilter,
      timezone,
      companyOrganizer,
      organization
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Analytics_fetched_successfully",
      data: Analytics,
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
  const getReservationTransactions = async (req, res) => {
    let { page=1, limit=5, companyOrganizer,organizations } = req.query;
    let { timezone } = req.user || "UTC";
    if (req.user.userType === "organizer") {
      companyOrganizer = req.user._id;
      if(organizations){
        organizations = await convertToMongoArray(organizations);
        companyOrganizer=undefined;
      }
    }
  limit = parseInt(limit);
    try {
      const {data, meta} = await AnalyticsService.getReservationTransactions({
        page,
        limit,
        timezone,
        companyOrganizer,
        organizations
      });

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "Analytics_fetched_successfully",
        data,
        meta
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
const getAnalyticsValue = async (req, res) => {
  const {
    key,
    subFilter = "all",
    dateFilter = "all",
  } = req.query;

  const timezone = req.user?.timezone || "UTC";

  // 1. Validate key
  if (!Analytics_KEYS[key]) {
    return res.status(400).json({
      message: "Invalid Analytics key",
    });
  }

  // 2. Validate subFilter (THIS IS WHERE IT IS USED)
  const isValidSubFilter = Analytics_KEYS[key].subFilters.some(
    (f) => f.key === subFilter
  );

  if (!isValidSubFilter) {
    return res.status(400).json({
      message: "Invalid sub filter for given key",
    });
  }

  // 3. Fetch calculated value
  const result = await AnalyticsService.getAnalyticsValue({
    key,
    subFilter,
    dateFilter,
    timezone,
  });

  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "Analytics_value_fetched_successfully",
    data: result,
  });
};

const getAnalyticsStats = async (req, res) => {
  const { dateFilter = "all" } = req.query;
  let { timezone } = req.user || "UTC";

  try {

    if (dateFilter && !validateParams(req, res, {
      enumFields: {
        dateFilter: ["all", "today", "thisWeek", "thisMonth"],
      },
    })) return;

    const Analytics = await AnalyticsService.getAnalyticsStats({
      dateFilter,
      timezone,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Analytics_stats_fetched_successfully",
      data: Analytics,
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






  const getReservationChnageLogs = async (req, res) => {
    let { page=1, limit=5, companyOrganizer, organizations } = req.query;
    let { timezone } = req.user || "UTC";
    if (req.user.userType === "organizer") {
      companyOrganizer = req.user._id;
      if(organizations){
        organizations = await convertToMongoArray(organizations);
        companyOrganizer=undefined;
      }
    }
  limit = parseInt(limit);
    try {
      const {data, meta} = await AnalyticsService.getReservationChnageLogs({
        page,
        limit,
        timezone,
        companyOrganizer,
        organizations
      });

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "Analytics_fetched_successfully",
        data,
        meta
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
  getAnalytics,
  getAnalyticsValue,
  getAnalyticsStats,
  getReservationTransactions,
  getReservationChnageLogs
};
