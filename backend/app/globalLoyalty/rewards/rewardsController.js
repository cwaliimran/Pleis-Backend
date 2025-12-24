const {
  sendResponse,
  validateParams,
} = require("@utils/responseUtil");

const rewardService = require("./rewardsService");

const getRewards = async (req, res) => {
  let { category, keyword } = req.query;
  const { rewards } = await rewardService.getGlobalRewardsService({
    userId: req.user._id,
    category,
    keyword,
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

  const result = await rewardService.claimGlobalRewardService(
    req.user._id,
    req.body.id
  );

  if (!result.success) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: result.message || "reward_claim_failed",
    });
  }

  sendResponse({
    res,
    statusCode: 200,
    translationKey: "reward_claimed_successfully",
    data: result.order,
  });
};

module.exports = {
  getRewards,
  claimReward,
};
