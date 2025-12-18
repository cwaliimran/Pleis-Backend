const { GlobalChallengesOrders } = require("@GlobalChallengesOrdersModel");

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
  return GlobalChallengesOrders.findByIdAndUpdate(orderId, {
    status: "completed",
    rewardClaimed: true,
    rewardClaimedAt: new Date()
  });
};



module.exports = {
  getActiveGlobalOrdersForDashboard,
  createGlobalChallengeOrder,
  updateProgressAndStatus,
  countCompletedGlobalOrders,
  findActiveGlobalOrder,
  markGlobalOrderCompleted
};
