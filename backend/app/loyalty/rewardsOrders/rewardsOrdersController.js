const {
  sendResponse,
  validateParams,
  getReadableErrorMessage,
  parsePaginationParams,
} = require("@utils/responseUtil");

const rewardService = require("./rewardsOrdersService");

const getUserOrders = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const { keyword, status, orderSort } = req.query;
    const userId = req.user._id;
    const { orders, meta,globalRewards } = await rewardService.getUserOrdersService({
      userId,
      page,
      limit,
      keyword,
      status,
      orderSort
    });


    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reward_orders_fetched_successfully",
      data: {orders, globalRewards},
      meta
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error,
    });
  }
};

const getOrderDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const userId = req.user._id;
    const response = await rewardService.getOrderDetailsService(id, userId);
    if (!response) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "reward_order_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reward_order_details_fetched_successfully",
      data: response,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error,
    });
  }
};


module.exports = {
  getUserOrders,
  getOrderDetails
};
