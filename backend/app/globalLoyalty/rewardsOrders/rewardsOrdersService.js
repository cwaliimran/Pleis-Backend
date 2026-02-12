const { generateMeta } = require("../../../helperUtils/responseUtil");
const { formatGlobalLoyaltyRewardOrder } = require("./formatter/formatLoyaltyRewardOrders");
const repo = require("./rewardsOrdersRepository");

const createGlobalRewardOrderService = async (userId, rewardId) => {
  return repo.createGlobalRewardOrder({ userId, rewardId });
};
const getUserOrdersService = async ({
  userId,
  page = 1,
  limit = 10,
  keyword,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const filter = {
    userId,
    keyword,
  };

  const { orders, total } = await repo.getUserOrders({
    filter,
    page,
    limit,
    skip,
  });
  let meta = generateMeta(page, limit, total);

  //format orders
  const formattedOrders = orders.map((order) => {
    return formatGlobalLoyaltyRewardOrder(order);
  });

  return { orders: formattedOrders, meta };
};

// Get reward order details
const getOrderDetailsService = async (orderId, userId) => {
  const order = await repo.getOrderDetails(orderId, userId);
  if (!order) return null;
  return formatGlobalLoyaltyRewardOrder(order);
};
module.exports = {
  createGlobalRewardOrderService,
  getUserOrdersService,
  getOrderDetailsService
};
