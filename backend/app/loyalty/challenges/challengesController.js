const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const challengeService = require("./challengesService");

const getChallenges = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);

  try {
    const userId = req.user._id;
    const companyOrganizer = req.params.companyOrganizer;

    const challenges = await challengeService.getEligibleChallengesForLoyaltyPage({
      userId,
      companyOrganizer,
      page,
      limit,
      timezone: req.user?.timezone,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "challenges_fetched_successfully",
      data: challenges,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error
    });
  }
};

const getChallengeDetails = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const challenge = await challengeService.getChallengeDetails(req.params.id);
    if (!challenge) {
      return sendResponse({ res, statusCode: 404, translationKey: "challenge_not_found" });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "challenge_details_fetched_successfully",
      data: challenge,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};


const getChallengesWithPagination = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);

  try {
    const userId = req.user._id;
    const { keyword } = req.query;

    const { challenges, meta } = await challengeService.getChallengesWithPaginationService({
      userId,
      page,
      limit,
      timezone: req.user?.timezone,
      keyword
    });


    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "challenges_fetched_successfully",
      data: challenges,
      meta,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error
    });
  }
};

module.exports = {
  getChallenges,
  getChallengeDetails,
  getChallengesWithPagination,
};
