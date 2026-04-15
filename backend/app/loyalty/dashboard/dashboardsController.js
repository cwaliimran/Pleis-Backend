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
    const { dashboard, meta } = await service.getDashboard({
      timezone: req.user?.timezone,
      userId,
    });
    console.log("userId",userId );
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "loyalty_fetched_successfully",
      data: dashboard,
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
