const rewardRepo = require("./rewardsRepository");

const { checkClaimLimitForLoyaltyRewards } = require("../rewardsOrders/rewardsOrdersRepository");
const { formatReward } = require("./formatters/formatReward");
const { normalizeRewardClaimMeta } = require("./formatters/normalizeRewardClaimMeta");


const getRewardsByCompanyOrganizerService = async ({
  companyOrganizer,
  userId,
}) => {
  // 1️⃣ Fetch all rewards
  const rewards = await rewardRepo.getRewardsByCompanyOrganizer({
    companyOrganizer,
  });

  // 2️⃣ Format rewards
  const formatted = rewards.map(item => formatReward(item));

  // 3️⃣ Batch check claim limits for user
  const claimResults = await checkClaimLimitForLoyaltyRewards(userId, rewards);

  // rewardId -> { totalClaimed, available }
  const claimMetaMap = new Map(
    claimResults.map(r => [
      String(r.rewardId),
      {
        totalClaimed: r.totalClaimed,
        available: r.available,
      },
    ])
  );

  // 4️⃣ Normalize claim metadata (SINGLE SOURCE OF TRUTH)
  const normalizedRewards = formatted.map((reward) => {
    const meta = claimMetaMap.get(String(reward._id)) ?? {
      totalClaimed: 0,
      available: true,
    };

    return {
      ...reward,
      ...normalizeRewardClaimMeta({
        reward,
        claimedCount: meta.totalClaimed,
        userPoints: null, // not available in this endpoint
      }),
    };
  });

  // 5️⃣ Group by sortingType
  const groupedRewards = groupRewardsBySortingType(normalizedRewards);

  return {
    rewards: groupedRewards,
  };
};



const groupRewardsBySortingType = (rewards) => {
  const groups = {};

  for (const reward of rewards) {
    const key = reward.sortingType || "";

    if (!groups[key]) {
      groups[key] = {
        sortingType: key,
        items: [],
      };
    }

    groups[key].items.push(reward);
  }

  return Object.values(groups);
};

const claimRewardService = async (userId, rewardId) => {
  // Logic to claim a reward for a user
  const result = await rewardRepo.claimReward(userId, rewardId);
  return result;
};


module.exports = {
  getRewardsByCompanyOrganizerService,
  claimRewardService,
};
