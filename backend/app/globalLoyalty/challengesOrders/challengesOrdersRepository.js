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


module.exports = {
  getActiveGlobalOrdersForDashboard,
  createGlobalChallengeOrder,
  updateProgressAndStatus
};
