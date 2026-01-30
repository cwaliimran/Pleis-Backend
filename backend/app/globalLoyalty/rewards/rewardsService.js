const rewardRepo = require("./rewardsRepository");
const { checkClaimLimitForGlobalRewards } =
  require("../rewardsOrders/rewardsOrdersRepository");
const { formatReward } = require("./formatters/formatReward");
const { getUserWallet } = require("../../userWalletService/global/walletManagement/userWalletService");
const { normalizeRewardClaimMeta } = require("../../loyalty/rewards/formatters/normalizeRewardClaimMeta");


 const getGlobalRewardsService = async ({ userId, category, keyword }) => {
  const [rewards, userWallet] = await Promise.all([
    rewardRepo.getGlobalRewards(category, keyword),
    getUserWallet(userId)
  ]);

  const userPoints = userWallet?.global?.points ?? 0;
  const userTierEntry = userWallet?.global?.level?.entryPoints ?? 0;

  const formatted = rewards.map(r => formatReward(r));

  const claimResults =
    await checkClaimLimitForGlobalRewards(userId, rewards);

  const claimMetaMap = new Map(
    claimResults.map(r => [
      String(r.rewardId),
      {
        totalClaimed: r.totalClaimed,
        available: r.available,
      },
    ])
  );

  const normalized = formatted.map(reward => {
    const meta = claimMetaMap.get(String(reward._id)) ?? {
      totalClaimed: 0,
      available: true,
    };

    return {
      ...reward,
      ...normalizeRewardClaimMeta({
        reward,
        claimedCount: meta.totalClaimed,
        userPoints,
        userTierEntry,
      }),
    };
  });

  return { rewards: normalized };
}; 


const claimGlobalRewardService = async (userId, rewardId) => {
  return rewardRepo.claimReward(userId, rewardId);
};

module.exports = {
  getGlobalRewardsService,
  claimGlobalRewardService,
};
