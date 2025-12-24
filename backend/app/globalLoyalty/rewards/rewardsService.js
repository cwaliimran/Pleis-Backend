const rewardRepo = require("./rewardsRepository");
const { checkClaimLimitForGlobalRewards } =
  require("../rewardsOrders/rewardsOrdersRepository");
const { formatReward } = require("./formatters/formatReward");
const { getUserWallet } = require("../../userWalletService/global/walletManagement/userWalletService");

const getGlobalRewardsService = async ({ userId, category,keyword }) => {

  // 1️⃣ Fetch all global rewards and user global wallet in parallel
  const [rewards, userWallet] = await Promise.all([
    rewardRepo.getGlobalRewards(category, keyword),
    getUserWallet(userId)
  ]);

  const userPoints = userWallet?.global?.points ?? 0;
  const userTierEntry = userWallet?.global?.level?.entryPoints ?? 0;

  // 2 Format rewards
  const formatted = rewards.map(r => formatReward(r));

  // 3 Claim-limit check
  const canClaimResults =
    await checkClaimLimitForGlobalRewards(userId, rewards);

  const canClaimMap = new Map();
  canClaimResults.forEach(r => {
    canClaimMap.set(String(r.rewardId), r.available);
  });

  // 4 Apply FULL eligibility logic (LIMIT + TIER + POINTS)
  const formattedWithCanClaim = formatted.map(reward => {

    const limitAllowed = canClaimMap.get(String(reward._id)) ?? true;

    // If claim limit already exceeded → hard stop
    if (!limitAllowed) {
      return { ...reward, canClaim: false };
    }

    const rewardTierEntry =
      reward?.tierLimit?.entryPoints ?? 0;

    const rewardMinPoints =
      reward?.minPointsRequiredToClaim ?? 0;

    // Tier eligibility
    if (userTierEntry < rewardTierEntry) {
      return { ...reward, canClaim: false };
    }

    // Points eligibility
    if (userPoints < rewardMinPoints) {
      return { ...reward, canClaim: false };
    }

    // All checks passed
    return { ...reward, canClaim: true };
  });

  return {
    rewards: formattedWithCanClaim
  };
};


const claimGlobalRewardService = async (userId, rewardId) => {
  return rewardRepo.claimReward(userId, rewardId);
};

module.exports = {
  getGlobalRewardsService,
  claimGlobalRewardService,
};
