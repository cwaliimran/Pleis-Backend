const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
} = require("@utils/responseUtil");

const dashboardService = require("./dashboardService");



const getDashboard = async (req, res) => {
  const { dateFilter = "all", companyOrganizer } = req.query;
  let { timezone } = req.user || "UTC";

  try {

    if (dateFilter && !validateParams(req, res, {
      enumFields: {
        dateFilter: ["all", "today", "thisWeek", "thisMonth"],
      },
    })) return;

    const dashboard = await dashboardService.getDashboard({
      companyOrganizer,
      dateFilter,
      timezone,
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

const getDashboardStats = async (req, res) => {
  const { dateFilter = "all", companyOrganizer } = req.query;
  let { timezone } = req.user || "UTC";

  try {

    if (dateFilter && !validateParams(req, res, {
      enumFields: {
        dateFilter: ["all", "today", "thisWeek", "thisMonth"],
      },
    })) return;

    const dashboard = await dashboardService.getDashboardStats({
      companyOrganizer,
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
  getDashboardStats,
};
