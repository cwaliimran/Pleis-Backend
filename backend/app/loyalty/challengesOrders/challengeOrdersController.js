const {
  sendResponse,
  validateParams,
  parsePaginationParams,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const service = require("./challengeOrdersService");


const updateChallengeByTaskType = async (req, res) => {
  try {
    const { taskType, value = 1 } = req.body;
    const userId = req.user._id;
    const { companyOrganizer } = req.body;


    if (!taskType || !companyOrganizer) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "task_type_and_company_required"
      });
    }

    const result = await service.resolveChallengeByTaskTypeService({
      userId,
      companyOrganizer,
      taskType,
      value
    });


    if (!result.success) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: result.message
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "challenge_progress_updated",
      data: result.order
    });
  } catch (error) {
    const err = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: err.message,
      error
    });
  }
};


const getUserOrders = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const { status, keyword, sort } = req.query;
    const userId = req.user._id;

    const result = await service.getUserChallengeOrdersService({
      userId, page, limit, status, keyword, sort
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "challenge_orders_fetched_successfully",
      data: result.orders,
      meta: result.meta
    });

  } catch (error) {
    const err = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: err.message, error });
  }
};

module.exports = {
  updateChallengeByTaskType,

  getUserOrders
};
