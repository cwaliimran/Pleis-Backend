const {
  sendResponse,
  getReadableErrorMessage
} = require("@utils/responseUtil");

const service = require("./challengesOrdersService");

/**
 * Internal endpoint
 * (called from events, actions, cron, etc.)
 */
const resolveGlobalChallenge = async (req, res) => {
  try {
    const userId = req.user._id;
    const { taskType, value } = req.body;

    const result =
      await service.resolveGlobalChallengeByTaskTypeService({
        userId,
        taskType,
        value
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "global_challenge_progress_updated",
      data: result
    });
  } catch (error) {
    const err = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: err.message,
      error
    });
  }
};

module.exports = {
  resolveGlobalChallenge
};
