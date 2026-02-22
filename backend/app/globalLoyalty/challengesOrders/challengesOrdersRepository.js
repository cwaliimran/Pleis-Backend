const { GlobalChallengesOrders } = require("@GlobalChallengesOrdersModel");
const { default: mongoose } = require("mongoose");

/**
 * Active challenge orders for dashboard
 */
const getActiveGlobalOrdersForDashboard = async ({ userId }) => {
  return GlobalChallengesOrders.find({
    user: userId,
    status: "in-progress"
  }).lean();
};

/**
 * Create new challenge order
 */
const createGlobalChallengeOrder = async (payload) => {
  return GlobalChallengesOrders.create(payload);
};

/**
 * Update progress + status atomically
 */
const updateProgressAndStatus = async (orderId, progress, status) => {
  return GlobalChallengesOrders.findByIdAndUpdate(
    orderId,
    {
      progress,
      status
    },
    { new: true }
  );
};

const countCompletedGlobalOrders = async ({ userId, challengeId }) => {
  return GlobalChallengesOrders.countDocuments({
    user: userId,
    challenge: challengeId,
    status: "completed"
  });
};

const findActiveGlobalOrder = async ({ userId, challengeId }) => {
  return GlobalChallengesOrders.findOne({
    user: userId,
    challenge: challengeId,
    status: "in-progress",
    $expr: { $lt: ["$progress.current", "$progress.target"] }
  }).sort({ createdAt: -1 });
};

const markGlobalOrderCompleted = async (orderId) => {
  return GlobalChallengesOrders.findOneAndUpdate(
    {
      _id: orderId,
      rewardClaimed: { $ne: true }
    },
    {
      status: "completed",
      rewardClaimed: true,
      rewardClaimedAt: new Date()
    },
    { new: true }
  );
};



/**
 * Get completed counts for multiple global challenges
 */
const getCompletedCountsForChallenges = async ({
  userId,
  challengeIds
}) => {

  if (!challengeIds?.length) return new Map();

  const results = await GlobalChallengesOrders.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        challenge: { $in: challengeIds },
        status: "completed"
      }
    },
    {
      $group: {
        _id: "$challenge",
        count: { $sum: 1 }
      }
    }
  ]);

  const map = new Map();

  for (const r of results) {
    map.set(r._id.toString(), r.count);
  }

  return map;
};


const getActiveGlobalOrdersForChallenges = async ({
  userId,
  challengeIds
}) => {

  if (!challengeIds?.length) return new Map();

  const orders = await GlobalChallengesOrders.find({
    user: userId,
    challenge: { $in: challengeIds },
    status: "in-progress",
    $expr: { $lt: ["$progress.current", "$progress.target"] }
  }).sort({ createdAt: -1 }).lean();

  const map = new Map();

  for (const order of orders) {
    const key = order.challenge.toString();

    // Only keep latest one per challenge
    if (!map.has(key)) {
      map.set(key, order);
    }
  }

  return map;
};

module.exports = {
  getActiveGlobalOrdersForDashboard,
  createGlobalChallengeOrder,
  updateProgressAndStatus,
  countCompletedGlobalOrders,
  findActiveGlobalOrder,
  markGlobalOrderCompleted,
  getCompletedCountsForChallenges,
  getActiveGlobalOrdersForChallenges
};
