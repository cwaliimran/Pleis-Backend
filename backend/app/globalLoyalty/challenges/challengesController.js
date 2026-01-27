const {
  sendResponse,
  getReadableErrorMessage,
  parsePaginationParams
} = require("@utils/responseUtil");

const service = require("./challengesService");

const getGlobalChallenges = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, skip } = parsePaginationParams(req);
    const timezone = req.user.timezone;
    const { keyword } = req.query;

    const result = await service.getGlobalLoyaltyChallenges({
      userId,
      timezone,
      keyword,
      page,
      limit,
      skip
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "global_loyalty_challenges_fetched",
      data: result.items || [],
      meta: result.meta
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
