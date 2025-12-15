const {
  sendResponse,
  validateParams,
  parsePaginationParams,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const service = require("./challengeOrdersService");


const updateChallengeProgress = async (req, res) => {
  try {
    const { challengeId } = req.body;
    const userId = req.user._id;
    if (!validateParams(req, res, { rawData: ["challengeId"] })) return;

    const result = await service.updateChallengeProgressService(userId, challengeId);

    if (!result.success) {
      return sendResponse({ res, statusCode: 400, translationKey: result.message });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "challenge_progress_updated",
      data: result.order,
    });

  } catch (error) {
    const err = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: err.message, error });
  }
};

const claimReward = async (req, res) => {
  try {
    const { challengeOrderId } = req.body;
    const userId = req.user._id;

    const result = await service.claimRewardService({ userId, challengeOrderId });

    if (!result.success) {
      return sendResponse({ res, statusCode: 400, translationKey: result.message });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "challenge_reward_claimed",
      data: result.order,
    });

  } catch (error) {
    const err = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: err.message, error });
  }
};

const getUserOrders = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const { status, keyword, sort } = req.query;
    const userId = req.user._id;

    const result = await service.getUserChallengeOrdersService({
      userId, page, limit, status, keyword, sort
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "challenge_orders_fetched_successfully",
      data: result.orders,
      meta: result.meta
    });

  } catch (error) {
    const err = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: err.message, error });
  }
};

module.exports = {
  updateChallengeProgress,
  claimReward,
  getUserOrders
};
