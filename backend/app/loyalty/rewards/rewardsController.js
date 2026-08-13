const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const rewardService = require("./rewardsService");

const getRewards = async (req, res) => {
  const keyword = req.query.keyword || "";

  try {
    const userId = req.user._id;
    const timezone = req.user?.timezone || "UTC";
    const companyOrganizer = req.params.companyOrganizer;

    const { rewards } = await rewardService.getRewardsByCompanyOrganizerService(
      {
        userId,
        companyOrganizer,
        timezone,
        keyword,
      },
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "rewards_fetched_successfully",
      data: rewards,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error,
    });
  }
};

const getRewardDetails = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] }))
    return;
  try {
    const userId = req.user._id;
    const reward = await rewardService.getRewardDetails(req.params.id, userId);
    if (!reward) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "reward_not_found",
      });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reward_details_fetched_successfully",
      data: reward,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error,
    });
  }
};

const claimReward = async (req, res) => {
  const { id, protectionUserDetails } = req.body; //protectionUserDetails only if ticket reward requirs protection details
  if (!validateParams(req, res, { rawData: ["id"], objectIdFields: ["id"] }))
    return;
  try {
    const rewardId = id;
    const userId = req.user._id;
    const timezone = req.user?.timezone;

    const result = await rewardService.claimRewardService(
      userId,
      rewardId,
      protectionUserDetails,
      timezone,
    );

    if (!result.success) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: result.message || "reward_claim_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reward_claimed_successfully",
      data: result.order,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error,
    });
  }
};

const getJoinedClubsRewards = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req);
    const { keyword } = req.query;
    const userId = req.user._id;
    const timezone = req.user?.timezone || "UTC";
    const result = await rewardService.getRewardsForUserJoinedClubs({
      userId,
      page,
      limit,
      skip,
      keyword,
      timezone,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "rewards_fetched_successfully",
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error,
    });
  }
};

module.exports = {
  getRewards,
  getRewardDetails,
  claimReward,
  getJoinedClubsRewards,
};
