const challengeRepo = require("./challengesRepository");
const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const formatChallenge = require("../../../commonModules/loyalty/challenges/formatters/formatChallenge");
const { checkClaimLimitForLoyaltyChallenges, getActiveChallengeOrdersForDashboard } = require("../challengesOrders/challengeOrdersRepository");
const { formatChallengesByTierKey } = require("./formatters/formatChallenge");
const clubMemberRepo = require("../clubMembers/clubMembersRepository");
const { formatUserWallet } = require("../clubMembers/formatters/formatUserWallet");

const { LoyaltyChallengesOrders } = require("@LoyaltyChallengesOrdersModel")
const Challenge = require("@ChallengeModel");


const getChallengeDetails = async (id) => {
  return await challengeRepo.findChallengeById(id);
};

const getEligibleChallengesForLoyaltyPage = async ({
  userId,
  companyOrganizer,
  timezone
}) => {
  const now = new Date();

  // 1️⃣ Wallet (tier)
  let userCompanyWallet = await clubMemberRepo.getWallet(userId, companyOrganizer);
  userCompanyWallet = formatUserWallet(userCompanyWallet);

  const tierKey = userCompanyWallet?.tierKey || "essential";
  const userTierEntry = userCompanyWallet?.level?.entryPoints ?? 0;

  // 2️⃣ Active orders (IMPORTANT: use snapshot)
  const activeOrders = await LoyaltyChallengesOrders.find({
    user: userId,
    companyOrganizer,
    status: "in-progress"
  }).lean();

  const activeOrderMap = new Map(
    activeOrders.map(o => [
      String(o.challengeSnapshot?._id || o.challenge),
      o
    ])
  );

  // 3️⃣ Active challenges
  let activeChallenges = await Challenge.find({
    companyOrganizer,
    status: "active",
    endDate: { $gte: now }
  })
    .populate("tierLimit")
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("reward.specialTicket.ticket")
    .lean();
  // 4️⃣ Apply tier formatting (CRITICAL)
  activeChallenges = formatChallengesByTierKey(activeChallenges, tierKey);

  // 5️⃣ Claim limit eligibility
  const claimResults =
    await checkClaimLimitForLoyaltyChallenges(userId, activeChallenges);
  const claimMap = new Map(
    claimResults.map(r => [String(r.challengeId), r.available])
  );

  // 6️⃣ Build final list
  const eligible = [];

  for (const ch of activeChallenges) {
    const challengeId = String(ch._id);

    const requiredEntry = ch?.tierLimit?.entryPoints ?? 0;
    const eligibleByTier = userTierEntry >= requiredEntry;
    const eligibleByLimit = claimMap.get(challengeId) !== false;

    if (!eligibleByTier || !eligibleByLimit) continue;

    const activeOrder = activeOrderMap.get(challengeId);

    eligible.push({
      ...formatChallenge(ch, timezone),
      canParticipate: true,
      isActive: Boolean(activeOrder),
      progress: activeOrder
        ? {
          current: activeOrder.progress.current,
          target: activeOrder.progress.target,
          percentage: Math.round(
            (activeOrder.progress.current / activeOrder.progress.target) * 100
          )
        }
        : null
    });
  }

  // 7️⃣ Sort: active → progress → effort
  eligible.sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;

    const pA = a.progress?.percentage ?? 0;
    const pB = b.progress?.percentage ?? 0;
    if (pA !== pB) return pB - pA;

    return (a.taskValue ?? 1) - (b.taskValue ?? 1);
  });

  let challenges = eligible || [];
  return challenges;
};

const getChallengesWithPaginationService = async ({
  userId,
  page = 1,
  limit = 10,
  timezone,
  keyword
}) => {
  const now = new Date();
  const skip = (page - 1) * limit;

  /* ------------------------------
     1️⃣ Clubs user follows
  ------------------------------ */
  const clubIds = await clubMemberRepo.getFollowedClubIds(userId);
  if (!clubIds.length) {
    return { items: [], meta: generateMeta(page, limit, 0) };
  }

  /* ------------------------------
     2️⃣ Fetch challenges (PAGED)
  ------------------------------ */
  const [challenges, total] = await Promise.all([
    challengeRepo.getChallengesWithPagination({
      clubIds,
      now,
      skip,
      limit,
      keyword
    }),
    challengeRepo.countChallengesWithPagination({ clubIds, now, keyword }),
  ]);


  if (!challenges.length) {
    return { items: [], meta: generateMeta(page, limit, total) };
  }

  /* ------------------------------
     3️⃣ Wallets (cached / batched)
  ------------------------------ */
  const wallets = await Promise.all(
    clubIds.map(org => clubMemberRepo.getWallet(userId, org))
  );

  const walletMap = new Map(
    wallets.map(w => {
      const fw = formatUserWallet(w);
      return [String(fw.companyOrganizer), fw];
    })
  );

  /* ------------------------------
     4️⃣ Active orders (ONLY page)
  ------------------------------ */
  const activeOrders =
    await getActiveChallengeOrdersForDashboard({
      userId,
      clubIds,
      challengeIds: challenges.map(c => c._id),
    });

  const activeOrderMap = new Map(
    activeOrders.map(o => [
      String(o.challengeSnapshot?._id || o.challenge),
      o,
    ])
  );

  /* ------------------------------
     5️⃣ Claim-limit check (batch)
  ------------------------------ */
  const claimResults =
    await checkClaimLimitForLoyaltyChallenges(userId, challenges);

  const claimMap = new Map(
    claimResults.map(r => [String(r.challengeId), r.available])
  );

  /* ------------------------------
     6️⃣ Enrich + eligibility
  ------------------------------ */
  const items = [];

  for (const ch of challenges) {
    const wallet = walletMap.get(String(ch.companyOrganizer?._id));
    if (!wallet) continue;

    const tierKey = wallet.tierKey || "essential";
    const userTierEntry = wallet?.level?.entryPoints ?? 0;

    const formatted =
      formatChallengesByTierKey([ch], tierKey)[0];

    const requiredEntry =
      formatted?.tierLimit?.entryPoints ?? 0;

    if (userTierEntry < requiredEntry) continue;
    if (claimMap.get(String(ch._id)) === false) continue;

    const activeOrder = activeOrderMap.get(String(ch._id));

    items.push({
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
          ),
        }
        : null,
    });
  }

  return {
    challenges: items,
    meta: generateMeta(page, limit, total),
  };
};


module.exports = {
  getEligibleChallengesForLoyaltyPage,
  getChallengeDetails,
  getChallengesWithPaginationService,
};
