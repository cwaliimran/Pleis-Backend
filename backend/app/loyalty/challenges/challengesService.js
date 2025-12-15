const challengeRepo = require("./challengesRepository");
const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const formatChallenge = require("../../../commonModules/loyalty/challenges/formatters/formatChallenge");
const { checkClaimLimitForLoyaltyChallenges } = require("../challengesOrders/challengeOrdersRepository");
const { formatChallengesByTierKey } = require("./formatters/formatChallenge");
const clubMemberRepo = require("../clubMembers/clubMembersRepository");
const { formatUserWallet } = require("../clubMembers/formatters/formatUserWallet");

const getChallenges = async ({
  userId,
  companyOrganizer,
  page,
  limit,
  timezone,
  keyword
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let [{ challenges, totalFiltered }, userCompanyWallet] =
    await Promise.all([
      challengeRepo.getChallengesByCompanyOrganizer({
        skip,
        limit,
        companyOrganizer,
        keyword
      }),
      clubMemberRepo.getWallet(userId, companyOrganizer)
    ]);

  userCompanyWallet = formatUserWallet(userCompanyWallet)

  const tierKey = userCompanyWallet?.tierKey || "essential";
  const userTierEntry =
    userCompanyWallet?.level?.entryPoints ?? 0;

  // 1️⃣ Format challenge data (basic)
  let formatted = challenges.map(ch => formatChallenge(ch, timezone));

  // 2️⃣ Apply tier-limit formatting
  formatted = formatChallengesByTierKey(formatted, tierKey);

  // 3️⃣ Claim-limit eligibility
  const limitResults = await checkClaimLimitForLoyaltyChallenges(userId, challenges);
  const limitMap = new Map(limitResults.map(r => [String(r.challengeId), r.available]));

  // 4️⃣ Apply ALL eligibility (limit + tier)
  const finalChallenges = formatted.map(ch => {
    const challengeId = String(ch._id);

    const eligibleByLimit = limitMap.get(challengeId) ?? true;

    if (!eligibleByLimit) return { ...ch, canParticipate: false };

    const challengeTierEntry = ch?.tierLimit?.entryPoints ?? 0;
    console.log("userTierEntry", userTierEntry)
    console.log("challengeTierEntry", challengeTierEntry)

    const eligibleByTier = userTierEntry >= challengeTierEntry;

    return {
      ...ch,
      canParticipate: eligibleByTier
    };
  });

  const meta = generateMeta(page, limit, totalFiltered);
  return { challenges: finalChallenges, meta };
};



const getChallengeDetails = async (id) => {
  return await challengeRepo.findChallengeById(id);
};

const getChallengesByCompanyOrganizerService = async ({
  page,
  limit,
  timezone,
  companyOrganizer,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const now = getCurrentDateInTimezone({ timezone });

  // 1️⃣ & 2️⃣ Fetch challenges and count in parallel
  const [challenges, totalFiltered] = await Promise.all([
    challengeRepo.getChallengesByCompanyOrganizer({
      skip,
      limit,
      companyOrganizer,
    }),
    challengeRepo.countChallenges({
      status: "active",
      companyOrganizer,
      endDate: { $gte: now },
    }),
  ]);

  // 3️⃣ meta
  const meta = generateMeta(page, limit, totalFiltered);

  // 4️⃣ formatted output
  const formattedChallenges = challenges.challenges.map(ch => formatChallenge(ch, timezone));

  return { items: formattedChallenges, meta };
};

module.exports = {
  getChallengesByCompanyOrganizerService,
  getChallenges,
  getChallengeDetails,
};
