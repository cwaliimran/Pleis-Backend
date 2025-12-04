const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const rewardService = require("./rewardsService");

const getRewards = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const keyword = req.query.keyword || "";
  try {
    const { rewards, meta } = await rewardService.getRewards({
      page,
      limit,
      timezone: req.user?.timezone,
      keyword,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "rewards_fetched_successfully",
      data: rewards,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const getRewardDetails = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const reward = await rewardService.getRewardDetails(req.params.id);
    if (!reward) {
      return sendResponse({ res, statusCode: 404, translationKey: "reward_not_found" });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reward_details_fetched_successfully",
      data: reward,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

module.exports = {
  getRewards,
  getRewardDetails,
};
