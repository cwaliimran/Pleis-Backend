const mongoose = require("mongoose");
const { LoyaltyChallengesOrders } = require("@LoyaltyChallengesOrdersModel");
const { getModelCounts } = require("@dbUtils/queryUtil");
const Challenge = require("@ChallengeModel");

// Create or get an existing challenge progress record
const startOrGetChallengeOrder = async ({ userId, challenge }) => {
  const active = await LoyaltyChallengesOrders.findOne({
    user: userId,
    challenge: challenge._id,
    status: "in-progress",
    $expr: { $lt: ["$progress.current", "$progress.target"] }
  }).sort({ createdAt: -1 });

  if (active) return active;

  return LoyaltyChallengesOrders.create({
    user: userId,
    challenge: challenge._id,
    companyOrganizer: challenge.companyOrganizer,
    challengeSnapshot: challenge,
    progress: {
      current: 0,
      target: challenge.taskValue ?? 1
    },
    status: "in-progress"
  });
};




// Increment progress
const incrementChallengeProgress = async ({ userId, challengeId, value }) => {
  return LoyaltyChallengesOrders.findOneAndUpdate(
    {
      user: userId,
      challenge: challengeId,
      status: "in-progress"
    },
    [
      {
        $set: {
          "progress.current": {
            $min: [
              { $add: ["$progress.current", value] },
              "$progress.target"
            ]
          }
        }
      }
    ],
    { new: true }
  );
};

const incrementChallengeProgressWithOverflow = async ({
  orderId,
  value
}) => {
  const order = await LoyaltyChallengesOrders.findById(orderId);

  if (!order || order.status !== "in-progress") return null;

  const remainingCapacity =
    order.progress.target - order.progress.current;

  const applied = Math.min(value, remainingCapacity);

  order.progress.current += applied;
  await order.save();

  return {
    order,
    applied,
    remaining: value - applied
  };
};




// Mark challenge completed
const markChallengeReadyToClaim = async (orderId) => {
  return LoyaltyChallengesOrders.findByIdAndUpdate(
    orderId,
    { status: "pending-claim" },
    { new: true }
  );
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
        status: { $in: ["completed"] }, // Only completed counts
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

/**
 * Find active challenge order by taskType
 */
const findActiveOrderByTaskType = async ({
  userId,
  companyOrganizer,
  taskType
}) => {
  return LoyaltyChallengesOrders.findOne({
    user: userId,
    companyOrganizer,
    status: "in-progress",
    $expr: { $lt: ["$progress.current", "$progress.target"] },
    "challengeSnapshot.taskType": taskType
  }).sort({ createdAt: -1 });
};


/**
 * Find eligible active challenges for organizer by taskType
 * Sorted by minimum effort first (taskValue ASC)
 */
const findEligibleChallengesByTaskType = async ({
  companyOrganizer,
  taskType
}) => {
  return Challenge.find({
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    status: "active",
    taskType,
    endDate: { $gte: new Date() }
  })
    .sort({ taskValue: 1, createdAt: 1 }) // ✅ easiest first
    .lean();
};

/**
 * Check if user can start a new cycle (claim limit)
 */
const canStartNewCycle = async (userId, challenge) => {
  if (!challenge.claimLimit || challenge.claimLimit <= 0) return true;

  const completedCount = await LoyaltyChallengesOrders.countDocuments({
    user: userId,
    challenge: challenge._id,
    status: "completed"
  });

  return completedCount < challenge.claimLimit;
};

const getActiveChallengeOrdersForDashboard = async ({
  userId,
  clubIds
}) => {
  return LoyaltyChallengesOrders.aggregate([
    {
      $match: {
        user: userId,
        companyOrganizer: { $in: clubIds },
        status: "in-progress"
      }
    },
    {
      $addFields: {
        progressPercentage: {
          $multiply: [
            { $divide: ["$progress.current", "$progress.target"] },
            100
          ]
        }
      }
    }
  ]);
};


module.exports = {
  findActiveOrderByTaskType,
  findEligibleChallengesByTaskType,
  canStartNewCycle,
  startOrGetChallengeOrder,
  incrementChallengeProgress,
  incrementChallengeProgressWithOverflow,
  markChallengeReadyToClaim,
  getUserChallengeOrders,
  getChallengeOrdersCounts,
  checkClaimLimitForLoyaltyChallenges,
  getActiveChallengeOrdersForDashboard
};
