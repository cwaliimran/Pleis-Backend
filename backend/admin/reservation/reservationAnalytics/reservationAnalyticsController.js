const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
} = require("../../../helperUtils/responseUtil");

const ReservationAnalyticsService = require("./reservationAnalyticsService");
const { ReservationAnalytics_KEYS } = require("./utils/reservationAnalyticsKeyMap");



const getReservationAnalytics = async (req, res) => {
  let { dateFilter = "all", companyOrganizer } = req.query;
  let { timezone } = req.user || "UTC";
  if (req.user.userType === "organizer") {
    companyOrganizer = req.user._id;
  }

  try {

    if (dateFilter && !validateParams(req, res, {
      enumFields: {
        dateFilter: ["all", "today", "thisWeek", "thisMonth"],
      },
    })) return;

    const ReservationAnalytics = await ReservationAnalyticsService.getReservationAnalytics({
      dateFilter,
      timezone,
      companyOrganizer,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ReservationAnalytics_fetched_successfully",
      data: ReservationAnalytics,
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
    let { page=1, limit=5, companyOrganizer } = req.query;
    let { timezone } = req.user || "UTC";
    if (req.user.userType === "organizer") {
      companyOrganizer = req.user._id;
    }
  limit = parseInt(limit);
    try {
      const {data, meta} = await ReservationAnalyticsService.getReservationTransactions({
        page,
        limit,
        timezone,
        companyOrganizer,
      });

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "ReservationAnalytics_fetched_successfully",
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
const getReservationAnalyticsValue = async (req, res) => {
  const {
    key,
    subFilter = "all",
    dateFilter = "all",
  } = req.query;

  const timezone = req.user?.timezone || "UTC";

  // 1. Validate key
  if (!ReservationAnalytics_KEYS[key]) {
    return res.status(400).json({
      message: "Invalid ReservationAnalytics key",
    });
  }

  // 2. Validate subFilter (THIS IS WHERE IT IS USED)
  const isValidSubFilter = ReservationAnalytics_KEYS[key].subFilters.some(
    (f) => f.key === subFilter
  );

  if (!isValidSubFilter) {
    return res.status(400).json({
      message: "Invalid sub filter for given key",
    });
  }

  // 3. Fetch calculated value
  const result = await ReservationAnalyticsService.getReservationAnalyticsValue({
    key,
    subFilter,
    dateFilter,
    timezone,
  });

  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "ReservationAnalytics_value_fetched_successfully",
    data: result,
  });
};

const getReservationAnalyticsStats = async (req, res) => {
  const { dateFilter = "all" } = req.query;
  let { timezone } = req.user || "UTC";

  try {

    if (dateFilter && !validateParams(req, res, {
      enumFields: {
        dateFilter: ["all", "today", "thisWeek", "thisMonth"],
      },
    })) return;

    const ReservationAnalytics = await ReservationAnalyticsService.getReservationAnalyticsStats({
      dateFilter,
      timezone,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ReservationAnalytics_stats_fetched_successfully",
      data: ReservationAnalytics,
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
    let { page=1, limit=5, companyOrganizer } = req.query;
    let { timezone } = req.user || "UTC";
    if (req.user.userType === "organizer") {
      companyOrganizer = req.user._id;
    }
  limit = parseInt(limit);
    try {
      const {data, meta} = await ReservationAnalyticsService.getReservationChnageLogs({
        page,
        limit,
        timezone,
        companyOrganizer,
      });

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "ReservationAnalytics_fetched_successfully",
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
  getReservationAnalytics,
  getReservationAnalyticsValue,
  getReservationAnalyticsStats,
  getReservationTransactions,
  getReservationChnageLogs
};
