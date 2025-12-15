const mongoose = require("mongoose");
const { LoyaltyChallengesOrders } = require("@LoyaltyChallengesOrdersModel");
const Challenge = require("@ChallengeModel");
const { getModelCounts } = require("@dbUtils/queryUtil");

// Create or get an existing challenge progress record
const startOrGetChallengeOrder = async ({ userId, challenge }) => {
  let existing = await LoyaltyChallengesOrders.findOne({
    user: userId,
    challenge: challenge._id
  });

  if (existing) return existing;

  return LoyaltyChallengesOrders.create({
    user: userId,
    challenge: challenge._id,
    companyOrganizer: challenge.companyOrganizer,
    challengeSnapshot: challenge,
    progress: {
      current: 0,
      target: challenge.taskValue ?? 1,
    }
  });
};

// Increment progress
const incrementChallengeProgress = async ({ userId, challengeId }) => {
  return LoyaltyChallengesOrders.findOneAndUpdate(
    {
      user: userId,
      challenge: challengeId,
      status: "in-progress",
    },
    {
      $inc: { "progress.current": 1 }
    },
    { new: true }
  );
};

// Mark challenge completed
const markChallengeCompleted = async (orderId) => {
  return LoyaltyChallengesOrders.findByIdAndUpdate(
    orderId,
    { status: "completed" },
    { new: true }
  );
};

// Claim challenge reward
const claimChallengeReward = async ({ orderId, userId }) => {
  const order = await LoyaltyChallengesOrders.findById(orderId);

  if (!order) return { success: false, message: "challenge_order_not_found" };
  if (order.status !== "completed")
    return { success: false, message: "challenge_not_completed" };

  order.rewardClaimed = true;
  order.rewardClaimedAt = new Date();
  order.status = "reward-claimed";

  await order.save();

  return { success: true, order };
};

// Get challenge orders for a user
const getUserChallengeOrders = async (filter, page = 1, limit = 10, sort = { createdAt: -1 }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  return LoyaltyChallengesOrders.find(filter)
    // .populate("challenge")
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
};

const getChallengeOrdersCounts = async (query, statusMap) => {
  return getModelCounts({ model: LoyaltyChallengesOrders, filterQuery: query, statusMap });
};


/**
 * Batch check claim limits for multiple challenges for a specific user.
 *
 * @param {string|ObjectId} userId
 * @param {Array<{ _id: ObjectId, claimLimit: Number }>} challenges
 * @returns {Promise<Array<{ challengeId: string, available: boolean }>>}
 */
async function checkClaimLimitForLoyaltyChallenges(userId, challenges = []) {
  if (!Array.isArray(challenges) || challenges.length === 0) return [];
  if (!userId) throw new Error("user_id_required");

  const challengeIds = challenges.map(c => c._id);

  // 1️⃣ Aggregate all user completions for these challenges
  const counts = await LoyaltyChallengesOrders.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        challenge: { $in: challengeIds },
        status: { $in: ["completed", "reward-claimed", "expired"] }, // Only completed counts
      },
    },
    {
      $group: {
        _id: "$challenge",
        totalCompletions: { $sum: 1 }
      }
    }
  ]);

  // Convert to lookup map
  const countMap = new Map();
  for (const c of counts) {
    countMap.set(String(c._id), c.totalCompletions);
  }

  // 2️⃣ Build eligibility result list
  const results = challenges.map(challenge => {
    const challengeId = String(challenge._id);
    const claimLimit = challenge.claimLimit;

    // No limit → always available
    if (!claimLimit || claimLimit <= 0) {
      return { challengeId, available: true };
    }

    const currentCompletions = countMap.get(challengeId) || 0;
    const available = currentCompletions < claimLimit;

    return { challengeId, available };
  });

  return results;
}

module.exports = {
  startOrGetChallengeOrder,
  incrementChallengeProgress,
  markChallengeCompleted,
  claimChallengeReward,
  getUserChallengeOrders,
  getChallengeOrdersCounts,
  checkClaimLimitForLoyaltyChallenges
};
