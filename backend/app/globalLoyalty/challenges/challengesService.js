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
  const now = new Date();

  // 1️⃣ Global wallet
  const wallet = await getUserWallet(userId);
  if (!wallet) {
    return { items: [], meta: generateMeta(page, limit, 0) };
  }

  const tierKey = wallet.global.level.type || "blue";
  const userTierEntry = wallet.global.level.entryPoints ?? 0;

  // 2️⃣ Active global challenges
  let challenges = await challengesRepo.getActiveGlobalChallenges({ now, keyword });

  // 3️⃣ Active orders (progress)
  const activeOrders =
    await challengeOrdersRepo.getActiveGlobalOrdersForDashboard({
      userId
    });

  const activeOrderMap = new Map(
    activeOrders.map(o => [
      String(o.challengeSnapshot?._id || o.challenge),
      o
    ])
  );

  // 4️⃣ Eligibility + formatting
  const eligible = [];

  for (const ch of challenges) {
    const requiredEntry = ch?.tierLimit?.[tierKey]?.entryPoints ?? 0;
    if (userTierEntry < requiredEntry) continue;

    const activeOrder = activeOrderMap.get(String(ch._id));

    eligible.push({
      ...formatGlobalChallenge(ch, timezone),
      isActive: Boolean(activeOrder),
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
