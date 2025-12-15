const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const rewardService = require("./rewardsService");
const { getUserCompanyWallet } = require("../clubMembers/clubMembersService");
const { formatRewardsByTierKey } = require("../../../commonModules/loyalty/rewards/utils/formatReward");

const getRewards = async (req, res) => {
  const keyword = req.query.keyword || "";

  try {
    const userId = req.user._id;
    const companyOrganizer = req.params.companyOrganizer;

    // Fetch rewards + wallet
    const [rewardsResponse, userCompanyWallet] = await Promise.all([
      rewardService.getRewardsByCompanyOrganizerService({
        userId,
        companyOrganizer,
        timezone: req.user?.timezone,
        keyword,
      }),
      getUserCompanyWallet(userId, companyOrganizer)
    ]);

    // Step 1: Format tier-specific limits
    let formattedRewards = formatRewardsByTierKey(
      rewardsResponse?.rewards || [],
      userCompanyWallet?.tierKey || "essential"
    );

    // User tier info
    const userTierEntry = userCompanyWallet?.level?.entryPoints ?? 0;
    const userPoints = userCompanyWallet?.points ?? 0;

    formattedRewards = formattedRewards.map(group => ({
      ...group,
      items: group.items.map(item => {

        const rewardTierEntry = item?.tierLimit?.entryPoints ?? 0;
        const rewardMinPoints = item?.minPointsRequiredToClaim ?? 0;


        // 1️⃣ If claimLimit says NO → keep it false
        if (item.canClaim === false) return item;

        // 2️⃣ Tier eligibility check
        const eligibleByTier = userTierEntry >= rewardTierEntry;
        if (!eligibleByTier) {
          return { ...item, canClaim: false };
        }

        // 3️⃣ Points eligibility check
        const eligibleByPoints = userPoints >= rewardMinPoints;
        if (!eligibleByPoints) {
          return { ...item, canClaim: false };
        }

        // All checks passed → claim allowed
        return {
          ...item,
          canClaim: true
        };
      })
    }));


    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "rewards_fetched_successfully",
      data: formattedRewards,
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


/* const getRewardDetails = async (req, res) => {
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
}; */

const claimReward = async (req, res) => {
  const { id } = req.body;
  if (!validateParams(req, res, { rawData: ["id"], objectIdFields: ["id"] })) return;
  try {
    const rewardId = id;
    const userId = req.user._id;

    const result = await rewardService.claimRewardService(userId, rewardId);

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
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

module.exports = {
  getRewards,
  // getRewardDetails,
  claimReward
};
