const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const service = require("./dashboardsService");


const get = async (req, res) => {
  try {
    const { _id: userId } = req.user;
    const { dashboards, meta } = await service.getDashboards({
      timezone: req.user?.timezone,
      userId,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "loyalty_fetched_successfully",
      data: dashboards,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

module.exports = {
  get,
};
