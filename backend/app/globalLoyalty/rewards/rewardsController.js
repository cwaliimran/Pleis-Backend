const {
  sendResponse,
  validateParams,
} = require("@utils/responseUtil");

const rewardService = require("./rewardsService");

const getRewards = async (req, res) => {
  let { category, keyword } = req.query;
  let { timezone } = req.user || {};
  const { rewards } = await rewardService.getGlobalRewardsService({
    userId: req.user._id,
    category,
    keyword,
    timezone
  });

  sendResponse({
    res,
    statusCode: 200,
    translationKey: "rewards_fetched_successfully",
    data: rewards,
  });
};

const claimReward = async (req, res) => {
  if (!validateParams(req, res, {
    rawData: ["id"],
    objectIdFields: ["id"]
  })) return;
  let { timezone } = req.user || {};
  let {
    id,
    protectionUserDetails,
  } = req.body;

  const result = await rewardService.claimGlobalRewardService(
    req.user._id,
    id,
    protectionUserDetails,
    timezone
  );

  if (!result.success) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: result.message || "reward_claim_failed",
    });
  }
  const orderResponse = {
    result,
    publicId: result.transactions?.[0]?.publicId || null
  };
  sendResponse({
    res,
    statusCode: 200,
    translationKey: "reward_claimed_successfully",
    data: orderResponse,
  });
};

module.exports = {
  getRewards,
  claimReward,
};
