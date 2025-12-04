const rewardRepo = require("./rewardsRepository");
const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const formatReward = require("../../../commonModules/loyalty/rewards/utils/formatReward");

const getRewardsByCompanyOrganizerService = async ({
  page,
  limit,
  companyOrganizer,
  status,
  timezone,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // const now = getCurrentDateInTimezone({ timezone });

  // 1️⃣ Fetch data
  const rewards = await rewardRepo.getRewardsByCompanyOrganizer({
    skip,
    limit,
    companyOrganizer,
    // now,
    status,
  });

  // 2️⃣ Count total matching rows
  const totalFiltered = await rewardRepo.countRewardsByCompanyOrganizer({
    companyOrganizer,
    status,
  });
  const meta = generateMeta(page, limit, totalFiltered);

  const formatted = rewards.map((item) => formatReward(item, timezone));

  return { rewards: formatted, meta };
};


module.exports = {
  getRewardsByCompanyOrganizerService,
};
