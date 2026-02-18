const GlobalReward = require("@GlobalLoyaltyReward");
const { createGlobalRewardOrderService } =
  require("../rewardsOrders/rewardsOrdersService");
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");

const getGlobalRewards = async (category, keyword) => {
  const now = new Date();

  const andConditions = [];

  // Category filter
  if (category) {
    andConditions.push({ category });
  }

  // Active reward
  andConditions.push({ status: "active" });

  // Expiry filter
  andConditions.push({
    $or: [
      { endDate: null },
      { endDate: { $gt: now } }
    ]
  });

  // Keyword filter
  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: GlobalReward.schema }],
      keyword
    );

    if (Object.keys(keywordMatch).length) {
      andConditions.push(keywordMatch);
    }
  }

  const query = andConditions.length
    ? { $and: andConditions }
    : {};

  return GlobalReward.find(query)
    .populate("tierLimit", "-backgroundImage")
    .populate("category", "title image")
    .populate("menuItem", "title image")
    .populate("event", "basicInfo schedule")
    .populate("ticket")
    .sort({ createdAt: -1 })
    .lean();
};


const claimReward = async (userId, rewardId,
    protectionUserDetails,
    timezone) => {
  return createGlobalRewardOrderService(userId, rewardId,
    protectionUserDetails,
    timezone);
};

module.exports = {
  getGlobalRewards,
  claimReward,
};
