const {
  sendResponse,
  parsePaginationParams,
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

module.exports = {
  getUserOrders,
};
