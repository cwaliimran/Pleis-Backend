const { getUserGlobalRewards } = require("../../../app/globalLoyalty/rewardsOrders/rewardsOrdersRepository");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const { formatGlobalLoyaltyRewardOrder } = require("../../globalLoyalty/rewardsOrders/formatter/formatLoyaltyRewardOrders");
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
  let [orders, counts] = await Promise.all([
    rewardRepo.getUserOrders(query, page, limit, sortQuery),
    rewardRepo.getRewardOrdersCounts(query, { status: ["pending", "expired", "completed"] }),
  ]);

  // Build meta
  const meta = generateMeta(page, limit, counts.totalFiltered);
  meta.rewardOrderCounts = counts;

  let formattedOrders = orders.map(order => {
    return formatLoyaltyRewardOrders(order);
  });
  return { orders: formattedOrders, meta };
};

// Get reward order details
const getLoyaltyRewardOrderDetailsService = async (orderId) => {
  const order = await rewardRepo.getOrderDetails(orderId);
  if (!order) return null;
  return formatLoyaltyRewardOrders(order);
};

const getAllRewardOrdersService = async ({
  userId,
  page = 1,
  limit = 10,
  status,
  keyword,
  sort = "desc"
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { data, total } =
    await rewardRepo.getCombinedRewardOrders({
      userId,
      status,
      keyword,
      skip,
      limit,
      sort: sort === "asc" ? 1 : -1
    });

  const meta = generateMeta(page, limit, total);

  const formattedOrders = data.map(order => {
    if (order.rewardScope === "global") {
      return formatGlobalLoyaltyRewardOrder(order);
    }
    return formatLoyaltyRewardOrders(order);
  });

  return { orders: formattedOrders, meta };
};


module.exports = {
  createRewardOrderService,
  getUserOrdersService,
  getLoyaltyRewardOrderDetailsService,
  getAllRewardOrdersService
};
