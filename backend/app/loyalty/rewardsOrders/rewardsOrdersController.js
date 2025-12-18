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
    const { orders, meta } = await rewardService.getUserOrdersService({
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
      data: orders,
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

module.exports = {
  getUserOrders,
};
