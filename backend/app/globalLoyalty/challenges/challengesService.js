const challengesRepo = require("./challengesRepository");
const challengeOrdersRepo =
  require("../challengesOrders/challengesOrdersRepository");

const formatGlobalChallenge =
  require("./formatters/formatGlobalChallenge");
const { generateMeta } =
  require("@utils/responseUtil");
const { getUserWallet } = require("../../userWalletService/global/walletManagement/userWalletService");

/**
 * Global Loyalty Challenges Dashboard
 * Uses global wallet + tier
 */
const getGlobalLoyaltyChallenges = async ({
  userId,
  timezone,
  keyword,
  page,
  limit,
  skip
}) => {
  // 1️⃣ Global wallet
  const wallet = await getUserWallet(userId);
  if (!wallet) {
    return { items: [], meta: generateMeta(page, limit, 0) };
  }

  const userTierEntry = wallet.global.level?.entryPoints ?? 0;

  // 2️⃣ Active global challenges
  let challenges = await challengesRepo.getActiveGlobalChallenges({ keyword, timezone });

  // 3️⃣ Active orders (progress) + completed claim counts
  const challengeIds = challenges.map((ch) => ch._id);

  const [activeOrders, completedCountsMap] = await Promise.all([
    challengeOrdersRepo.getActiveGlobalOrdersForDashboard({ userId }),
    challengeOrdersRepo.getCompletedCountsForChallenges({
      userId,
      challengeIds,
    }),
  ]);

  const activeOrderMap = new Map(
    activeOrders.map(o => [
      String(o.challengeSnapshot?._id || o.challenge),
      o
    ])
  );

  // 4️⃣ Eligibility + formatting (mirror company loyalty)
  const eligible = [];

  for (const ch of challenges) {
    const challengeId = String(ch._id);
    const requiredEntry = ch?.tierLimit?.entryPoints ?? 0;
    const claimLimit = ch.claimLimit;
    const completedCount = completedCountsMap.get(challengeId) || 0;

    const eligibleByTier = userTierEntry >= requiredEntry;
    const eligibleByLimit =
      !claimLimit || claimLimit <= 0 || completedCount < claimLimit;

    // Hide when tier too low or claim limit exhausted
    if (!eligibleByTier || !eligibleByLimit) continue;

    const activeOrder = activeOrderMap.get(challengeId);
    const claimRemaining =
      claimLimit > 0 ? Math.max(claimLimit - completedCount, 0) : null;

    eligible.push({
      ...formatGlobalChallenge(ch, timezone),
      canParticipate: true,
      isActive: Boolean(activeOrder),
      isClaimed: completedCount > 0,
      completedCount,
      claimRemaining,
      progress: activeOrder
        ? {
            current: activeOrder.progress.current,
            target: activeOrder.progress.target,
            percentage: Math.round(
              (activeOrder.progress.current /
                activeOrder.progress.target) * 100
            )
          }
        : null
    });
  }

  // 5️⃣ Sort: active → progress → effort
  eligible.sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;

    const pA = a.progress?.percentage ?? 0;
    const pB = b.progress?.percentage ?? 0;
    if (pA !== pB) return pB - pA;

    return (a.taskValue ?? 1) - (b.taskValue ?? 1);
  });

  const total = eligible.length;
  const start = skip;
  const end = skip + limit;

  return {
    items: eligible.slice(start, end),
    meta: generateMeta(page, limit, total)
  };
};

module.exports = {
  getGlobalLoyaltyChallenges
};
