const {
  sendResponse,
  parsePaginationParams,
  validateParams,
} = require("@utils/responseUtil");

const rewardService = require("./rewardsOrdersService");

const getUserOrders = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword } = req.query;

  const { orders, meta } =
    await rewardService.getUserOrdersService({
      userId: req.user._id,
      page,
      limit,
      keyword,
    });

  sendResponse({
    res,
    statusCode: 200,
    translationKey: "reward_orders_fetched_successfully",
    data: orders,
    meta,
  });
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
