const { getUserGlobalRewards } = require("../../../app/globalLoyalty/rewardsOrders/rewardsOrdersRepository");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const { formatLoyaltyRewardOrders } = require("./formatter/formatLoyaltyRewardOrders");
const rewardRepo = require("./rewardsOrdersRepository");


// Claim reward service (create reward order)
const createRewardOrderService = async (userId, rewardId) => {
  return rewardRepo.createRewardOrder({ userId, rewardId });
};

// Get user reward orders
const getUserOrdersService = async ({
  userId,
  page = 1,
  limit = 10,
  status,
  keyword,
  sort = "desc"
}) => {
  const query = { user: userId };

  // STATUS filter
  if (status) {
    query.status = status === "deleted" ? "deleted" : { $ne: "deleted", $eq: status };
  } else {
    query.status = { $ne: "deleted" };
  }

  // KEYWORD search (search reward title from snapshot)
  if (keyword) {
    query["snapshot.title"] = { $regex: keyword, $options: "i" };
  }

  // Sorting
  const sortQuery = { createdAt: sort === "asc" ? 1 : -1 };

  // Run queries in parallel
  let [orders, counts,globalRewards] = await Promise.all([
    rewardRepo.getUserOrders(query, page, limit, sortQuery),
    rewardRepo.getRewardOrdersCounts(query, { status: ["pending", "expired", "completed"] }),
    getUserGlobalRewards(userId)
  ]);

  // Build meta
  const meta = generateMeta(page, limit, counts.totalFiltered);
  meta.rewardOrderCounts = counts;

  let formattedOrders = orders.map(order => {
    return formatLoyaltyRewardOrders(order);
  });
  return { orders: formattedOrders, meta, globalRewards };
};

// Get reward order details
const getOrderDetailsService = async (orderId, userId) => {
  const order = await rewardRepo.getOrderDetails(orderId, userId);
  if (!order) return null;
  return formatLoyaltyRewardOrders(order);
};

module.exports = {
  createRewardOrderService,
  getUserOrdersService,
  getOrderDetailsService
};
