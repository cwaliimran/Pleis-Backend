const {
  sendResponse,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const engagementService = require("./engagementEventsService");

/**
 * -------------------------------------------------------
 * LOG ENGAGEMENT
 * POST /api/v1/app/engagement/log
 * -------------------------------------------------------
 */
const logEngagement = async (req, res) => {
  try {
    const { entityType, entityId, action } = req.body;
    const userId = req.user?._id || null;

    await engagementService.logEngagementService({
      entityType,
      entityId,
      action,
      userId,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "engagement_logged_successfully",
      data: null,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

/**
 * -------------------------------------------------------
 * TRENDING
 * GET /api/v1/app/engagement/trending
 * -------------------------------------------------------
 */
const getTrending = async (req, res) => {
  try {
    const {
      entityType,
      action = "view",
      window = "48h",
      limit = 10,
    } = req.query;

    const now = Date.now();
    let since;

    if (window === "48h") {
      since = new Date(now - 48 * 60 * 60 * 1000);
    } else if (window === "7d") {
      since = new Date(now - 7 * 24 * 60 * 60 * 1000);
    } else {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_trending_window",
      });
    }

    const data = await engagementService.getTrendingService({
      entityType,
      action,
      since,
      limit: Number(limit),
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "trending_fetched_successfully",
      data,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

module.exports = {
  logEngagement,
  getTrending,
};
