const {
  sendResponse,
  getReadableErrorMessage
} = require("@utils/responseUtil");

const service = require("./challengesService");

const getGlobalChallenges = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10 } = req.query;
    const timezone = req.user.timezone;

    const result = await service.getGlobalLoyaltyChallenges({
      userId,
      timezone,
      page: Number(page),
      limit: Number(limit)
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "global_loyalty_challenges_fetched",
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
  getGlobalChallenges
};
