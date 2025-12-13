const repo = require("./challengeOrdersRepository");
const Challenge = require("@ChallengeModel");
const { generateMeta } = require("@utils/responseUtil");
const { formatChallenge } = require("./formatters/formatChallenge");
const { createTransaction } = require("../../userWalletService/transactions/services/unifiedTransactionsService");

/**
 * Unified challenge progress service.
 * - Creates challenge order on first action
 * - Increments progress
 * - Marks challenge complete when progress meets target
 * - Issues reward if applicable
 */
const updateChallengeProgressService = async (userId, challengeId) => {
  const challenge = await Challenge.findById(challengeId).lean();

  if (!challenge) return { success: false, message: "challenge_not_found" };
  if (challenge.status !== "active")
    return { success: false, message: "challenge_not_active" };
  if (challenge.endDate && challenge.endDate < new Date())
    return { success: false, message: "challenge_expired" };

  // ---------------------------------------------------------
  // Step 1: Create or get existing challenge order
  // ---------------------------------------------------------
  let order = await repo.startOrGetChallengeOrder({ userId, challenge });

  // Already completed → no more progress allowed
  if (order.status === "completed" || order.status === "reward-claimed") {
    return { success: true, order };
  }

  // ---------------------------------------------------------
  // Step 2: Increment progress
  // ---------------------------------------------------------
  order = await repo.incrementChallengeProgress({
    userId,
    challengeId
  });

  if (!order) {
    return { success: false, message: "challenge_progress_not_found" };
  }

  // If not yet complete → return progress only
  if (order.progress.current < order.progress.target) {
    return { success: true, order, message: "progress_updated" };
  }

  // ---------------------------------------------------------
  // Step 3: Mark completed
  // ---------------------------------------------------------
  const completedOrder = await repo.markChallengeCompleted(order._id);

  // ---------------------------------------------------------
  // Step 4: Award Rewards (points type only)
  // ---------------------------------------------------------
  const reward = challenge.reward;

  if (reward?.rewardType === "points" && reward.rewardValue > 0) {
    const rewardPoints = reward.rewardValue;

    const trx = await createTransaction(
      {
        user: userId,
        companyOrganizer: challenge.companyOrganizer,
        organization: null,
        type: "earn",
        domainType: "loyaltychallengesorders",
        entityId: completedOrder._id,
        companyPoints: {
          base: rewardPoints,
          total: rewardPoints,
        },
        globalPoints: {
          base: rewardPoints,
          total: rewardPoints,
        },
        allowNegative: false,
        description: `Challenge reward ${challenge.title}`,
      },
      null
    );

    if (!trx.success) {
      return {
        success: false,
        message: trx.message || "challenge_reward_transaction_failed",
      };
    }

    completedOrder.rewardTransaction = trx.transactions;
  }

  return { success: true, order: completedOrder, message: "challenge_completed" };
};


const claimRewardService = async ({ userId, challengeOrderId }) => {
  const result = await repo.claimChallengeReward({ orderId: challengeOrderId, userId });

  return result;
};

// Get user challenge orders with pagination + filters
const getUserChallengeOrdersService = async ({
  userId,
  page = 1,
  limit = 10,
  status,
  keyword,
  sort = "desc"
}) => {
  const query = { user: userId };

  if (status) query.status = status;
  else query.status = { $ne: "deleted" };

  if (keyword) {
    query["challengeSnapshot.title"] = { $regex: keyword, $options: "i" };
  }

  const sortQuery = { createdAt: sort === "asc" ? 1 : -1 };

  const [orders, counts] = await Promise.all([
    repo.getUserChallengeOrders(query, page, limit, sortQuery),
    repo.getChallengeOrdersCounts(query, { status: ["in-progress", "completed", "reward-claimed"] })
  ]);

  const meta = generateMeta(page, limit, counts.totalFiltered);
  meta.challengeOrderCounts = counts;

  // Format orders
  const formattedOrders = orders.map(order => {
    const formatted = formatChallenge(order);
    return formatted;
  });

  return { orders: formattedOrders, meta };
};

module.exports = {
  updateChallengeProgressService,
  claimRewardService,
  getUserChallengeOrdersService
};
