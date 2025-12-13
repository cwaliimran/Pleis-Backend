const rewardRepo = require("./rewardsRepository");
const {formatReward} = require("../../../commonModules/loyalty/rewards/utils/formatReward");
  const { checkClaimLimitForLoyaltyRewards } = require("../rewardsOrders/rewardsOrdersRepository");

const getRewardsByCompanyOrganizerService = async ({
  companyOrganizer,
  userId,
}) => {
  // 1️⃣ Fetch all rewards
  const rewards = await rewardRepo.getRewardsByCompanyOrganizer({
    companyOrganizer,
  });

  // 2️⃣ Format rewards
  const formatted = rewards.map((item) => formatReward(item));

  // 3️⃣ Batch check canClaim for user
  const canClaimResults = await checkClaimLimitForLoyaltyRewards(userId, rewards);

  // Convert results array → map for fast lookup
  const canClaimMap = new Map();
  canClaimResults.forEach((e) => {
    canClaimMap.set(String(e.rewardId), e.available);
  });

  // 4️⃣ Add canClaim flag to formatted rewards
  const formattedWithCanClaim = formatted.map((reward) => ({
    ...reward,
    canClaim: canClaimMap.get(String(reward._id)) ?? true,
  }));

  // 5️⃣ Group by sortingType
  const groupedRewards = groupRewardsBySortingType(formattedWithCanClaim);

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
