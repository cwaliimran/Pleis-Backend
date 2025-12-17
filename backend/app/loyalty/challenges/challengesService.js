const challengeRepo = require("./challengesRepository");
const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const formatChallenge = require("../../../commonModules/loyalty/challenges/formatters/formatChallenge");
const { checkClaimLimitForLoyaltyChallenges } = require("../challengesOrders/challengeOrdersRepository");
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



module.exports = {
  getEligibleChallengesForLoyaltyPage,
  getChallengeDetails,
};
