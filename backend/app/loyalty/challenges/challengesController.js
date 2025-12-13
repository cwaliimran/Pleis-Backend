const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const challengeService = require("./challengesService");
const { getUserCompanyWallet } = require("../clubMembers/clubMembersService");
const { formatChallengesByTierKey } = require("./formatters/formatChallenge");

const getChallenges = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const keyword = req.query.keyword || "";

  try {
    const userId = req.user._id;
    const companyOrganizer = req.params.companyOrganizer;

    // Fetch challenges + wallet
    const [{ challenges, meta }, userCompanyWallet] = await Promise.all([
      challengeService.getChallenges({
        userId,
        companyOrganizer,
        page,
        limit,
        timezone: req.user?.timezone,
        keyword
      }),
      getUserCompanyWallet(userId, companyOrganizer)
    ]);

    const tierKey = userCompanyWallet?.tierKey || "essential";
    const userTierEntry = userCompanyWallet?.level?.entryPoints ?? 0;

    // 1️⃣ Format tier-values
    let formattedChallenges = formatChallengesByTierKey(challenges, tierKey);

    // 2️⃣ Apply tier rule WITHOUT overriding existing canParticipate
    formattedChallenges = formattedChallenges.map(item => {
      const challengeTierEntry = item?.tierLimit?.entryPoints ?? 0;

      const eligibleByTier = userTierEntry >= challengeTierEntry;

      return {
        ...item,
        canParticipate: item.canParticipate && eligibleByTier
      };
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "challenges_fetched_successfully",
      data: formattedChallenges,
      meta
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

module.exports = {
  getChallenges,
  getChallengeDetails,
};
