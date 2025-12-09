const { findUserByIdAndCheckExists } = require("../../usersManagement/usersRepository");
const { getChallengesByCompanyOrganizerService } = require("../challenges/challengesService");
const { getPromotionsByCompanyOrganizerService } = require("../promotions/promotionsService");
const { getRewardsByCompanyOrganizerService } = require("../rewards/rewardsService");
const clubMemberRepo = require("./clubMembersRepository");
const { formatUserWallet, formatUserWallets } = require("./formatters/formatUserWallet");
const { formatRewardsByTierKey } = require("../../../commonModules/loyalty/rewards/utils/formatReward");
// Count members
const countClubMembers = async (filters = {}) => {
  return clubMemberRepo.countClubMembers(filters);
};

// Get full details
const getClubMemberDetails = async (id) => {
  return clubMemberRepo.findClubMemberById(id);
};

// Join club
const joinClub = async (userId, companyOrganizer) => {
  const isValidCompanyOrganizer = await findUserByIdAndCheckExists(companyOrganizer);
  if (!isValidCompanyOrganizer) {
    throw new Error("Invalid company organizer.");
  }
  return clubMemberRepo.joinClub(userId, companyOrganizer);
};

// Leave club
const leaveClub = async (userId, companyOrganizer) => {
  return clubMemberRepo.leaveClub(userId, companyOrganizer);
};

// Check membership
const isClubMember = async (userId, companyOrganizer) => {
  return clubMemberRepo.isClubMember(userId, companyOrganizer);
};

// Get user's active clubs
const getUserJoinedClubs = async (userId) => {
  return clubMemberRepo.getUserJoinedClubs(userId);
};

const getUserJoinedClubsWithPoints = async (userId) => {
  let clubs = await clubMemberRepo.getUserJoinedClubsWithPoints(userId);
  return formatUserWallets(clubs);
};

// 🔥 NEW: Get Wallet (points, current tier, next tier)
const getUserCompanyWallet = async (userId, companyOrganizer) => {
  let wallet = await clubMemberRepo.getWallet(userId, companyOrganizer);
  return formatUserWallet(wallet);
};

// 🔥 NEW: Update Points & auto promotion/demotion
const updateUserCompanyPoints = async (payload) => {
  let wallet = await clubMemberRepo.updatePoints(payload);
  return formatUserWallet(wallet);
};

const getCompanyProfileWithLoyaltyInfo = async (timezone, userId, companyOrganizer) => {
  const [profile, userCompanyWallet, rewards, challenges, promotions] = await Promise.all([
    {},
    clubMemberRepo.isClubMemberWithWallet(userId, companyOrganizer),
    getRewardsByCompanyOrganizerService({
      companyOrganizer,
      timezone,
    }),
    getChallengesByCompanyOrganizerService({
      page: 1,
      limit: 10,
      timezone,
      companyOrganizer,
    }),
    getPromotionsByCompanyOrganizerService({
      page: 1,
      limit: 10,
      timezone,
      companyOrganizer,
    }),
  ]);


  const formattedRewards = formatRewardsByTierKey(
    rewards?.rewards || [],
    userCompanyWallet?.tierKey || "essential"
  );

  return {
    profile,
    userCompanyWallet: formatUserWallet(userCompanyWallet),
    rewards: formattedRewards,
    challenges: {
      items: challenges.challenges,
      meta: challenges.meta
    },
    promotions: {
      items: promotions.promotions,
      meta: promotions.meta
    }
  };
};

module.exports = {
  countClubMembers,
  getClubMemberDetails,
  joinClub,
  leaveClub,
  isClubMember,
  getUserJoinedClubs,

  // NEW loyalty methods
  getUserCompanyWallet,
  updateUserCompanyPoints,
  getUserJoinedClubsWithPoints,
  getCompanyProfileWithLoyaltyInfo
};
