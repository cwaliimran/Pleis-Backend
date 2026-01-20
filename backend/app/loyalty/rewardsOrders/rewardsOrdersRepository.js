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
    if (reward.endDate && reward.endDate < new Date()) {
      throw new Error("reward_expired");
    }

    // 🔒 HARD ENFORCEMENT
    if (reward.claimLimit > 0) {
      const currentClaims = await RewardsOrders.countDocuments(
        {
          user: userId,
          sourceType: "rewards",
          sourceId: reward._id,
          status: { $ne: "expired" },
        },
        { session }
      );

      if (currentClaims >= reward.claimLimit) {
        throw new Error("reward_claim_limit_reached");
      }
    }

    // Create order
    const [orderDoc] = await RewardsOrders.create(
      [
        {
          user: userId,
          sourceId: reward._id,
          sourceType: "rewards",
          snapshot: reward,
          pointsUsed: reward.minPointsRequiredToClaim || 0,
          companyOrganizer: reward.companyOrganizer,
        },
      ],
      { session }
    );

    // Deduct wallet points
    const trx = await createTransaction(
      {
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
      },
      session
    );

    if (!trx.success) {
      throw new Error(trx.message || "transaction_failed");
    }

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

  const rewardIds = rewards.map(r => new mongoose.Types.ObjectId(r._id));

  // 1️⃣ Aggregate user claim counts
  const counts = await RewardsOrders.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        sourceType: "rewards",
        sourceId: { $in: rewardIds },
        status: { $ne: "expired" },
      },
    },
    {
      $group: {
        _id: "$sourceId",
        totalClaims: { $sum: 1 },
      },
    },
  ]);

  // rewardId → totalClaims
  const countMap = new Map();
  for (const c of counts) {
    countMap.set(String(c._id), c.totalClaims);
  }

  // 2️⃣ Build result per reward
  return rewards.map((reward) => {
    const rewardId = String(reward._id);
    const claimLimit = reward.claimLimit;
    const totalClaimed = countMap.get(rewardId) || 0;

    // No limit → always claimable
    if (!claimLimit || claimLimit <= 0) {
      return {
        rewardId,
        totalClaimed,
        available: true,
      };
    }

    return {
      rewardId,
      totalClaimed,
      available: totalClaimed < claimLimit,
    };
  });
}


const getRewardOrdersCounts = async (query, statusMap) => {
  return getModelCounts({ model: RewardsOrders, filterQuery: query, statusMap });
}


const getUserOrders = async (filter, page = 1, limit = 10, sort = { createdAt: -1 }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  return RewardsOrders.find(filter)
    .populate("companyOrganizer", "companyDetails.loyaltySettings.title companyDetails.logo")
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
