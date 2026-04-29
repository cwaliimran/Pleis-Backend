const mongoose = require("mongoose");
const { getSuggestedLoyaltyClubs } = require("../../organizationProfile/organizationProfileService");
const { getUserJoinedClubsWithPoints } = require("../clubMembers/clubMembersService");
const clubMemberRepo = require("../clubMembers/clubMembersRepository");
const { formatChallengesByTierKey } = require("../challenges/formatters/formatChallenge");
const { checkClaimLimitForLoyaltyChallenges } = require("../challengesOrders/challengeOrdersRepository");
const challengesRepo = require("../challenges/challengesRepository");
const challengeOrdersRepo = require("../challengesOrders/challengeOrdersRepository");
const formatChallenge = require("../../../commonModules/loyalty/challenges/formatters/formatChallenge");
const { formatUserWallet } = require("../clubMembers/formatters/formatUserWallet");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const rewardsRepo = require("../rewards/rewardsRepository");
const { formatSingleRewardByTierKey } = require("../../../commonModules/loyalty/rewards/utils/formatReward");
const { formatReward } = require("../rewards/formatters/formatReward");
const { RewardsOrders } = require("@LoyaltyRewardsOrdersModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { getPromotionsForDashboard } = require("../promotions/promotionsRepository");
const { getUserWallet } = require("../../userWalletService/global/walletManagement/userWalletService");
const { normalizeRewardClaimMeta } = require("../rewards/formatters/normalizeRewardClaimMeta");



const getDashboard = async ({ timezone, userId }) => {

  let [userGlobalWallet, joinedClubs, suggestedClubs, loyaltyRewards, loyaltyChallenges, loyaltyPromotions] = await Promise.all([
    getUserWallet(userId),
    getUserJoinedClubsWithPoints({ userId, page: 1, limit: 10, skip: 0 }),
    getSuggestedLoyaltyClubs({ userId }),
    getSuggestedRewardsForDashboard({
      userId,
      page: 1,
      limit: 10,
      timezone
    }),
    getLoyaltyDashboardChallenges({
      userId,
      timezone,
      page: 1,
      limit: 10
    }),
    getPromotionsForDashboard({
      userId,
      timezone,
      page: 1,
      limit: 10
    })
  ]);

  return {
    dashboard: {
      userGlobalWallet: userGlobalWallet?.global ?? userGlobalWallet ?? null,
      joinedClubs: joinedClubs.data || [],
      suggestedClubs: suggestedClubs.formatted || [],
      loyaltyRewards: loyaltyRewards || { items: [], meta: { total: 0, page: 1, limit: 10 } },
      loyaltyChallenges: loyaltyChallenges || { items: [], meta: { total: 0, page: 1, limit: 10 } },
      loyaltyPromotions: loyaltyPromotions || { items: [], meta: { total: 0, page: 1, limit: 10 } }
    }
  };
};

// loyaltyDashboardService.js
const getLoyaltyDashboardChallenges = async ({
  userId,
  page = 1,
  limit = 10,
  timezone
}) => {
  const now = new Date();

  // 1️⃣ Clubs user follows
  const clubIds = await clubMemberRepo.getFollowedClubIds(userId);
  if (!clubIds.length) {
    return { items: [], meta: { total: 0, page, limit } };
  }

  // 2️⃣ Wallet per club (tier info)
  const wallets = await Promise.all(
    clubIds.map(org => clubMemberRepo.getWallet(userId, org))
  );

  const walletMap = new Map();
  wallets.forEach(w => {
    const fw = formatUserWallet(w);
    walletMap.set(String(fw.companyOrganizer), fw);
  });

  // 3️⃣ Active challenge orders (progress driver)
  const activeOrders =
    await challengeOrdersRepo.getActiveChallengeOrdersForDashboard({
      userId,
      clubIds
    });

  const activeOrderMap = new Map(
    activeOrders.map(o => [
      String(o.challengeSnapshot?._id || o.challenge),
      o
    ])
  );

  // 4️⃣ Fetch all eligible challenges
  let challenges =
    await challengesRepo.getEligibleChallengesForDashboard({
      clubIds,
      now
    });

  // 5️⃣ Claim limit filtering
  const claimResults =
    await checkClaimLimitForLoyaltyChallenges(userId, challenges);

  const claimMap = new Map(
    claimResults.map(r => [String(r.challengeId), r.available])
  );

  // 6️⃣ Eligibility + formatting
  const eligible = [];

  for (const ch of challenges) {
    const wallet = walletMap.get(String(ch.companyOrganizer._id));
    if (!wallet) continue;

    const tierKey = wallet.tierKey || "essential";
    const userTierEntry = wallet?.level?.entryPoints ?? 0;

    const formatted = formatChallengesByTierKey([ch], tierKey)[0];
    const requiredEntry = formatted?.tierLimit?.entryPoints ?? 0;

    if (userTierEntry < requiredEntry) continue;
    if (claimMap.get(String(ch._id)) === false) continue;

    const activeOrder = activeOrderMap.get(String(ch._id));

    eligible.push({
      ...formatChallenge(formatted, timezone),
      isActive: Boolean(activeOrder),
      progress: activeOrder
        ? {
          current: activeOrder.progress.current,
          target: activeOrder.progress.target,
          percentage: Math.round(
            (activeOrder.progress.current /
              activeOrder.progress.target) *
            100
          )
        }
        : null,
    });
  }

  // 7️⃣ Sort (Active → Progress → Effort)
  eligible.sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;

    if (a.progressPercentage !== b.progressPercentage) {
      return b.progressPercentage - a.progressPercentage;
    }

    return (a.taskValue ?? 1) - (b.taskValue ?? 1);
  });

  // 8️⃣ REAL pagination (slice AFTER relevance ordering)
  const total = eligible.length;
  const start = (page - 1) * limit;
  const end = start + limit;

  let meta = generateMeta(page, limit, total);

  return {
    items: eligible.slice(start, end),
    meta
  };
};


const getSuggestedRewardsForDashboard = async ({
  userId,
  page = 1,
  limit = 10,
  timezone
}) => {
  const now = new Date();
  const skip = (page - 1) * limit;

  // 1️⃣ Clubs user follows
  const clubIds = await clubMemberRepo.getFollowedClubIds(userId);
  if (!clubIds.length) {
    return { items: [], meta: generateMeta(page, limit, 0) };
  }

  // 2️⃣ Wallets (points + tier per club)
  const wallets = await Promise.all(
    clubIds.map(org => clubMemberRepo.getWallet(userId, org))
  );

  const walletMap = new Map();
  wallets.forEach(w => {
    const fw = formatUserWallet(w);
    walletMap.set(String(fw.companyOrganizer), fw);
  });

  // 3️⃣ Fetch rewards (DB paginated)
  const rewards = await rewardsRepo.getRewardsForDashboardPaged({
    clubIds,
    now,
    skip,
    limit,
    timezone
  });

  if (!rewards.length) {
    return { items: [] };
  }

  const rewardObjectIds = rewards
    .map(r => r?._id)
    .filter(Boolean)
    .map(id => new mongoose.Types.ObjectId(id));

  const rewardIdStrings = rewardObjectIds.map(id => String(id));
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // 4️⃣ Count how many times user already claimed each reward
  const [rewardOrderClaims, ticketRewardClaims] = await Promise.all([
    RewardsOrders.aggregate([
      {
        $match: {
          user: userObjectId,
          sourceType: "rewards",
          sourceId: { $in: rewardObjectIds },
          status: { $ne: "expired" }
        }
      },
      {
        $group: {
          _id: "$sourceId",
          total: { $sum: 1 }
        }
      }
    ]),
    TicketingOrders.aggregate([
      {
        $match: {
          user: userObjectId,
          status: { $ne: "cancelled" },
          "meta.type": "rewards",
          $or: [
            { "meta.id": { $in: rewardObjectIds } },
            { "meta.id": { $in: rewardIdStrings } }
          ]
        }
      },
      {
        $group: {
          _id: { $toString: "$meta.id" },
          total: { $sum: 1 }
        }
      }
    ])
  ]);

  const claimedMap = new Map();

  for (const c of rewardOrderClaims) {
    const key = String(c._id);
    claimedMap.set(key, (claimedMap.get(key) || 0) + c.total);
  }

  for (const c of ticketRewardClaims) {
    const key = String(c._id);
    claimedMap.set(key, (claimedMap.get(key) || 0) + c.total);
  }

  // 5️⃣ Eligibility + formatting
  const eligible = [];

  for (const reward of rewards) {
    const wallet =
      walletMap.get(String(reward.companyOrganizer._id));
    if (!wallet) continue;

    const rewardId = String(reward._id);

    // Tier formatting
    const rewardByTierKey =
      formatSingleRewardByTierKey(
        reward,
        wallet.tierKey || "essential"
      );

    const formattedReward = formatReward(rewardByTierKey, timezone);

    const userPoints = wallet.points ?? 0;
    const userTierEntry = wallet?.level?.entryPoints ?? 0;
    const requiredTierEntry =
      formattedReward?.tierLimit?.entryPoints ?? 0;

    if (userTierEntry < requiredTierEntry) continue;

    // Claimed logic
    const claimedCount = claimedMap.get(rewardId) || 0;

    eligible.push({
      ...formattedReward,
      ...normalizeRewardClaimMeta({
        reward: formattedReward,
        claimedCount,
        userPoints,
        userTierEntry,
      }),
    });

  }

  // 6️⃣ Sort (dashboard priority)
  eligible.sort((a, b) => {
    if (a.canClaim && !b.canClaim) return -1;
    if (!a.canClaim && b.canClaim) return 1;
    return a.pointsRequired - b.pointsRequired;
  });

  return {
    items: eligible,
  };
};



module.exports = {
  getDashboard,
};
