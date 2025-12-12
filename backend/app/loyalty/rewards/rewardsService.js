const rewardRepo = require("./rewardsRepository");
const {formatReward} = require("../../../commonModules/loyalty/rewards/utils/formatReward");

const getRewardsByCompanyOrganizerService = async ({
  companyOrganizer,
  status,
  timezone,
}) => {
  // 1️⃣ Fetch all rewards
  const rewards = await rewardRepo.getRewardsByCompanyOrganizer({
    companyOrganizer,
    status,
  });

  // 2️⃣ Format rewards
  const formatted = rewards.map((item) => formatReward(item, timezone));

  // 3️⃣ Group by sortingType
  const groupedRewards = groupRewardsBySortingType(formatted);

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


module.exports = {
  getRewardsByCompanyOrganizerService,
};
