const challengeRepo = require("./challengesRepository");
const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const { Challenge } = require("../../../commonModules/loyalty/challenges/models/Challenge");
const { buildKeywordQueryFromModels } = require("../../../helperUtils/dbUtils/queryUtil");
const formatChallenge = require("../../../commonModules/loyalty/challenges/formatters/formatChallenge");
const { checkClaimLimitForLoyaltyChallenges } = require("../challengesOrders/challengeOrdersRepository");
const { getUserCompanyWallet } = require("../clubMembers/clubMembersService");

const getChallenges = async ({
  userId,
  companyOrganizer,
  page,
  limit,
  timezone,
  keyword
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [{ challenges, totalFiltered }, userCompanyWallet] =
    await Promise.all([
      challengeRepo.getChallengesByCompanyOrganizer({
        skip,
        limit,
        companyOrganizer,
        keyword
      }),
      getUserCompanyWallet(userId, companyOrganizer)
    ]);

  const formatted = challenges.map(ch => formatChallenge(ch, timezone));

  // 1️⃣ Claim-limit eligibility
  const limitResults = await checkClaimLimitForLoyaltyChallenges(userId, challenges);

  console.log("limitResults",limitResults)

  const limitMap = new Map();
  limitResults.forEach(r => limitMap.set(String(r.challengeId), r.available));

  // 2️⃣ User tier info
  const userTierEntry = userCompanyWallet?.level?.entryPoints ?? 0;

  // 3️⃣ Final mapping with tier eligibility
  const finalChallenges = formatted.map(ch => {
    const challengeId = String(ch._id);

    // claim-limit eligibility
    const eligibleByLimit = limitMap.get(challengeId) ?? true;

    // If limit already blocks participation → final result is false
    if (!eligibleByLimit) {
      return { ...ch, canParticipate: false };
    }

    // Tier eligibility
    const challengeTierEntry = ch?.tierLimit?.entryPoints ?? 0;
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
