const rewardRepo = require("./rewardsRepository");

const { checkClaimLimitForLoyaltyRewards } = require("../rewardsOrders/rewardsOrdersRepository");
const { formatReward } = require("./formatters/formatReward");
const { formatRewardDetails } = require("./formatters/formatRewardDetils");
const { normalizeRewardClaimMeta } = require("./formatters/normalizeRewardClaimMeta");
const clubMemberRepo = require("../clubMembers/clubMembersRepository");
const { formatUserWallet } = require("../clubMembers/formatters/formatUserWallet");
const { RewardsOrders } = require("@LoyaltyRewardsOrdersModel");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const { formatSingleRewardByTierKey } = require("../../../commonModules/loyalty/rewards/utils/formatReward");
const { addEngagementEvent } = require("@appEngagement/engagementEventsRepository");

const getRewardsByCompanyOrganizerService = async ({
  companyOrganizer,
  userId,
  timezone
}) => {
  // 1️⃣ Fetch user wallet (points + tier)
  const wallet = await clubMemberRepo.getWallet(userId, companyOrganizer, null, { autoCreate: false });

  const formattedWallet = formatUserWallet(wallet);

  const userPoints = formattedWallet?.points ?? 0;
  const userTierEntry = formattedWallet?.level?.entryPoints ?? 0;
  const tierKey = formattedWallet?.tierKey || "essential";

  // 2️⃣ Fetch rewards
  const rewards = await rewardRepo.getRewardsByCompanyOrganizer({
    companyOrganizer,
  });

  if (!rewards.length) {
    return { rewards: [] };
  }

  // 3️⃣ Apply tier-specific formatting BEFORE eligibility
  const formatted = rewards.map(item =>
    formatReward(
      formatSingleRewardByTierKey(item, tierKey,), timezone
    )
  );

  // 4️⃣ Batch check claim limits
  const claimResults = await checkClaimLimitForLoyaltyRewards(
    userId,
    rewards
  );

  const claimMetaMap = new Map(
    claimResults.map(r => [
      String(r.rewardId),
      {
        totalClaimed: r.totalClaimed,
        available: r.available,
      },
    ])
  );

  // 5️⃣ Normalize eligibility (SINGLE SOURCE OF TRUTH)
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
        userPoints,
        userTierEntry,
      }),
    };
  });

  // 6️⃣ Group by sortingType
  const groupedRewards =
    groupRewardsBySortingType(normalizedRewards);

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

const claimRewardService = async (userId, rewardId, protectionUserDetails, timezone) => {
  // Logic to claim a reward for a user
  const result = await rewardRepo.claimReward(userId, rewardId, protectionUserDetails, timezone);
  return result;
};

const getRewardsForUserJoinedClubs = async ({
  userId,
  page = 1,
  limit = 10,
  skip = 0,
  keyword = "",
  timezone
}) => {
  const now = new Date();
  /* ===============================
     1️⃣ Clubs user is member of
  =============================== */
  const clubIds = await clubMemberRepo.getFollowedClubIds(userId);
  if (!clubIds.length) {
    return { items: [], meta: generateMeta(page, limit, 0) };
  }

  /* ===============================
     2️⃣ Wallets (ONCE)
  =============================== */
  const wallets = await Promise.all(
    clubIds.map(orgId => clubMemberRepo.getWallet(userId, orgId, null, { autoCreate: false }))
  );

  const walletMap = new Map();
  wallets.forEach(w => {
    const fw = formatUserWallet(w);
    walletMap.set(String(fw.companyOrganizer), fw);
  });

  /* ===============================
     3️⃣ Fetch rewards (paged)
  =============================== */
  const [rewards, total] = await Promise.all([
    rewardRepo.getRewardsForDashboardPaged({
      clubIds,
      now,
      skip,
      limit,
      keyword,
    }),
    rewardRepo.countDashboardRewards({ clubIds, now, keyword }),
  ]);

  if (!rewards.length) {
    return { items: [], meta: generateMeta(page, limit, total) };
  }

  /* ===============================
     4️⃣ Claim counts (ONE QUERY)
  =============================== */
  const claimedCounts = await RewardsOrders.aggregate([
    {
      $match: {
        user: userId,
        sourceType: "rewards",
        sourceId: { $in: rewards.map(r => r._id) },
      },
    },
    {
      $group: {
        _id: "$sourceId",
        total: { $sum: 1 },
      },
    },
  ]);

  const claimedMap = new Map(
    claimedCounts.map(c => [String(c._id), c.total])
  );

  /* ===============================
     5️⃣ Eligibility + normalize
  =============================== */
  const items = [];

  for (const reward of rewards) {
    const wallet =
      walletMap.get(String(reward.companyOrganizer._id));
    if (!wallet) continue;

    // Tier-specific reward view
    const rewardByTierKey = formatSingleRewardByTierKey(
      reward,
      wallet.tierKey || "essential"
    );

    const formattedReward = formatReward(rewardByTierKey, timezone);

    const claimedCount =
      claimedMap.get(String(formattedReward._id)) || 0;

    items.push({
      ...formattedReward,
      ...normalizeRewardClaimMeta({
        reward: formattedReward,
        claimedCount,
        userPoints: wallet.points ?? 0,
      }),
    });
  }

  /* ===============================
     6️⃣ Sort (dashboard UX)
  =============================== */
  items.sort((a, b) => {
    if (a.canClaim && !b.canClaim) return -1;
    if (!a.canClaim && b.canClaim) return 1;
    return a.pointsRequired - b.pointsRequired;
  });

  return {
    items,
    meta: generateMeta(page, limit, total),
  };
};

const getRewardDetails = async (rewardId, userId) => {
  const reward = await rewardRepo.getRewardById(rewardId);
  if (!reward) {
    throw new Error("reward_not_found");
  }
  addEngagementEvent({
    entityType: "rewards",
    entityId: rewardId,
    action: "view",
    userId,
  });
  const formattedReward = await formatRewardDetails(reward);
  return formattedReward;
};
module.exports = {
  getRewardsByCompanyOrganizerService,
  claimRewardService,
  getRewardsForUserJoinedClubs,
  getRewardDetails,
};
