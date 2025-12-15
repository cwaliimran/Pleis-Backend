const repo = require("./challengeOrdersRepository");
const Challenge = require("@ChallengeModel");
const { generateMeta } = require("@utils/responseUtil");
const { formatChallenge } = require("./formatters/formatChallenge");
const { createTransaction } = require("../../userWalletService/transactions/services/unifiedTransactionsService");
const { RewardsOrders } = require("@LoyaltyRewardsOrdersModel");
const { LoyaltyChallengesOrders } = require("@LoyaltyChallengesOrdersModel");
const { findBestActiveChallengeByTaskType } = require("../challenges/challengesRepository");

/**
 * Unified challenge progress service.
 * - Creates challenge order on first action
 * - Increments progress
 * - Marks challenge complete when progress meets target
 * - Issues reward if applicable
 */
const updateChallengeProgressByTaskTypeService = async ({
  userId,
  companyOrganizer,
  taskType,
  value = 1
}) => {
  // 1️⃣ Find best challenge
  const challenge =
    await findBestActiveChallengeByTaskType({
      companyOrganizer,
      taskType
    });

  if (!challenge) {
    return { success: false, message: "no_active_challenge_found" };
  }

  // 2️⃣ Get or create order (with claim limit enforced)
  let order = await repo.startOrGetChallengeOrder({
    userId,
    challenge
  });

  if (!order) {
    return { success: false, message: "challenge_claim_limit_reached" };
  }

  // 3️⃣ Increment progress
  order = await repo.incrementChallengeProgress({
    userId,
    challengeId: challenge._id,
    value
  });

  if (!order) {
    return { success: false, message: "challenge_progress_not_found" };
  }

  return { success: true, order };
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
    repo.getChallengeOrdersCounts(query, { status: ["in-progress", "completed", "expired"] })
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


/**
 * Resolve challenge dynamically by taskType
 * - Reuse active order
 * - Otherwise find easiest eligible challenge
 * - Enforce claim limits
 */
const resolveChallengeByTaskTypeService = async ({
  userId,
  companyOrganizer,
  taskType,
  value = 1
}) => {
  // --------------------------------------------------
  // 1️⃣ Reuse active cycle if exists
  // --------------------------------------------------
  let activeOrder = await repo.findActiveOrderByTaskType({
    userId,
    companyOrganizer,
    taskType
  });

  if (activeOrder) {
    return incrementExistingOrder(activeOrder, value);
  }

  // --------------------------------------------------
  // 2️⃣ Find eligible challenges (easiest first)
  // --------------------------------------------------
  const challenges = await repo.findEligibleChallengesByTaskType({
    companyOrganizer,
    taskType
  });

  if (!challenges.length) {
    return { success: false, message: "no_active_challenge_found" };
  }

  // --------------------------------------------------
  // 3️⃣ Pick first challenge user can still claim
  // --------------------------------------------------
  for (const challenge of challenges) {
    const canStart = await repo.canStartNewCycle(userId, challenge);
    if (!canStart) continue;

    const order = await repo.startOrGetChallengeOrder({
      userId,
      challenge
    });

    return incrementExistingOrder(order, value);
  }

  return { success: false, message: "challenge_claim_limit_reached" };
};

/**
 * Increment progress and finalize if completed
 */
const incrementExistingOrder = async (order, value) => {
  // 🔒 Hard guard
  if (order.progress.current >= order.progress.target) {
    return { success: false, message: "no_active_challenge_found" };
  }

  const updated = await repo.incrementChallengeProgress({
    userId: order.user,
    challengeId: order.challenge,
    value
  });

  if (!updated) {
    return { success: false, message: "challenge_progress_not_found" };
  }

  if (updated.progress.current < updated.progress.target) {
    return { success: true, order: updated };
  }

  return finalizeChallengeCompletion(updated);
};


const finalizeChallengeCompletion = async (order) => {
  const challenge = order.challengeSnapshot;

  // 1️⃣ Issue reward
  if (challenge.reward.rewardType === "points" && challenge.rewardValue > 0) {
    await createTransaction(
      {
        user: order.user,
        companyOrganizer: challenge.companyOrganizer,
        type: "earn",
        domainType: "loyaltychallengesorders",
        entityId: order._id,
        companyPoints: {
          base: challenge.rewardValue,
          total: challenge.rewardValue
        },
        description: `Challenge reward ${challenge.title}`
      },
      null
    );
  } else {
    await RewardsOrders.create({
      user: order.user,
      sourceType: "loyaltychallengesorders",
      sourceId: order._id,
      snapshot: challenge,
      companyOrganizer: challenge.companyOrganizer
    });
  }

  // 2️⃣ Mark completed
  await LoyaltyChallengesOrders.findByIdAndUpdate(order._id, {
    status: "completed",
    rewardClaimed: true,
    rewardClaimedAt: new Date()
  });

  return { success: true, order, message: "challenge_completed" };
};

module.exports = {
  resolveChallengeByTaskTypeService,
  updateChallengeProgressByTaskTypeService,
  getUserChallengeOrdersService
};
