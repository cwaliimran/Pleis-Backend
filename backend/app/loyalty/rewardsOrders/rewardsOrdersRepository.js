const mongoose = require("mongoose");
const Reward = require("@RewardModel");
const { RewardsOrders } = require("@LoyaltyRewardsOrdersModel");
const { createTransaction } = require("../../userWalletService/transactions/services/unifiedTransactionsService");
const { getModelCounts } = require("@dbUtils/queryUtil");

// Create reward order (claim)
const createRewardOrder = async ({ userId, rewardId }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const reward = await Reward.findById(rewardId).lean();
    if (!reward) throw new Error("reward_not_found");
    if (reward.status !== "active") throw new Error("reward_not_active");
    if (reward.endDate && reward.endDate < new Date()) throw new Error("reward_expired");

    const [limitCheck] = await checkClaimLimitForLoyaltyRewards(userId, [reward]);
    if (!limitCheck.available) throw new Error("reward_claim_limit_reached");

    // 1) Create order
    const order = await RewardsOrders.create(
      [{
        user: userId,
        sourceId: reward._id,
        sourceType: "rewards",
        snapshot: reward,
        pointsUsed: reward.minPointsRequiredToClaim || 0,
        companyOrganizer: reward.companyOrganizer,
      }],
      { session }
    );
    const orderDoc = order[0];

    // 2) Deduct wallet points
    const trx = await createTransaction({
      user: userId,
      companyOrganizer: reward.companyOrganizer,
      type: "redeem",
      domainType: "loyaltyrewardsorders",
      entityId: orderDoc._id,
      companyPoints: {
        base: reward.minPointsRequiredToClaim || 0,
        total: -(reward.minPointsRequiredToClaim || 0),
      },
      allowNegative: false,
      description: `Claimed reward ${reward.title}`,
    }, session);

    
    if (!trx.success) {
      return { success: false, message: trx.message || "transaction_failed" };
    }

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    return { success: true, order: orderDoc, transactions: trx.transactions };

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    return { success: false, message: err.message };
  }
};


/**
 * Batch check claim limits for multiple rewards for a specific user.
 *
 * @param {Array<{ _id: ObjectId, claimLimit: Number }>} rewards
 * @param {string|ObjectId} userId
 * @returns {Promise<Array<{ rewardId: string, available: boolean }>>}
 */
async function checkClaimLimitForLoyaltyRewards(userId, rewards = []) {
  if (!Array.isArray(rewards) || rewards.length === 0) return [];
  if (!userId) throw new Error("user_id_required");

  const rewardIds = rewards.map(r => r._id);

  // 1️⃣ Aggregate all user claims in ONE database query
  const counts = await RewardsOrders.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        reward: { $in: rewardIds },
        status: { $ne: "expired" },
      },
    },
    {
      $group: {
        _id: "$reward",
        totalClaims: { $sum: 1 },
      },
    },
  ]);

  // Convert results to lookup map
  const countMap = new Map();
  for (const c of counts) {
    countMap.set(String(c._id), c.totalClaims);
  }

  // 2️⃣ Build availability results
  const results = rewards.map((reward) => {
    const rewardId = String(reward._id);
    const claimLimit = reward.claimLimit;

    // No limit → available
    if (!claimLimit || claimLimit <= 0) {
      return { rewardId, available: true };
    }

    const currentClaims = countMap.get(rewardId) || 0;
    const available = currentClaims < claimLimit;

    return { rewardId, available };
  });

  return results;
}

const getRewardOrdersCounts = async (query, statusMap) => {
  return getModelCounts({ model: RewardsOrders, filterQuery: query, statusMap });
}


const getUserOrders = async (filter, page = 1, limit = 10, sort = { createdAt: -1 }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  return RewardsOrders.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
};


module.exports = {
  createRewardOrder,
  getUserOrders,
  getRewardOrdersCounts,
  checkClaimLimitForLoyaltyRewards
};
