const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
} = require("../../helperUtils/responseUtil");

const dashboardService = require("./dashboardService");
const { DASHBOARD_KEYS } = require("./utils/dashboardKeyMap");



const getDashboard = async (req, res) => {
  const { dateFilter = "all" } = req.query;
  let { timezone } = req.user || "UTC";
  let companyOrganizer;
  if(req.user.userType==="organizer"){
    companyOrganizer = req.user._id;
  }

  try {

    if (dateFilter && !validateParams(req, res, {
      enumFields: {
        dateFilter: ["all", "today", "thisWeek", "thisMonth"],
      },
    })) return;

    const dashboard = await dashboardService.getDashboard({
      dateFilter,
      timezone,
      companyOrganizer,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "dashboard_fetched_successfully",
      data: dashboard,
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



const getDashboardValue = async (req, res) => {
  const {
    key,
    subFilter = "all",
    dateFilter = "all",
  } = req.query;

  const timezone = req.user?.timezone || "UTC";

  // 1. Validate key
  if (!DASHBOARD_KEYS[key]) {
    return res.status(400).json({
      message: "Invalid dashboard key",
    });
  }

  // 2. Validate subFilter (THIS IS WHERE IT IS USED)
  const isValidSubFilter = DASHBOARD_KEYS[key].subFilters.some(
    (f) => f.key === subFilter
  );

  if (!isValidSubFilter) {
    return res.status(400).json({
      message: "Invalid sub filter for given key",
    });
  }

  // 3. Fetch calculated value
  const result = await dashboardService.getDashboardValue({
    key,
    subFilter,
    dateFilter,
    timezone,
  });
  
  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "dashboard_value_fetched_successfully",
    data: result,
  });
};

const getDashboardStats = async (req, res) => {
  const { dateFilter = "all" } = req.query;
  let { timezone } = req.user || "UTC";

  try {

    if (dateFilter && !validateParams(req, res, {
      enumFields: {
        dateFilter: ["all", "today", "thisWeek", "thisMonth"],
      },
    })) return;

    const dashboard = await dashboardService.getDashboardStats({
      dateFilter,
      timezone,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "dashboard_stats_fetched_successfully",
      data: dashboard,
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
  getDashboard,
  getDashboardValue,
  getDashboardStats,
};
