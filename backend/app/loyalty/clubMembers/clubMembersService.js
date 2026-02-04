const { findUserByIdAndCheckExists } = require("../../usersManagement/usersRepository");
const { getPromotionsByCompanyOrganizerService } = require("../promotions/promotionsService");
const { getRewardsByCompanyOrganizerService } = require("../rewards/rewardsService");
const clubMemberRepo = require("./clubMembersRepository");
const { formatUserWallet, formatUserWallets, formatLoyaltyProfile } = require("./formatters/formatUserWallet");
const { formatRewardsByTierKey } = require("../../../commonModules/loyalty/rewards/utils/formatReward");
const { getRecentTransactionsForDashboard } = require("../../userWalletService/transactions/services/unifiedTransactionsService");
const { getEligibleChallengesForLoyaltyPage } = require("../challenges/challengesService");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const { logEngagementService } = require("@appEngagement/engagementEventsService");

// Count members
const countClubMembers = async (filters = {}) => {
  return clubMemberRepo.countClubMembers(filters);
};

// Get full details
const getClubMemberDetails = async (id) => {
  return clubMemberRepo.findClubMemberById(id);
};

// Join club
const joinClub = async (userId, companyOrganizer, referrerId) => {
  const isValidCompanyOrganizer = await findUserByIdAndCheckExists(companyOrganizer);
  if (!isValidCompanyOrganizer) {
    throw new Error("Invalid company organizer.");
  }
  return clubMemberRepo.joinClub(userId, companyOrganizer, referrerId);
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

const getUserJoinedClubsWithPoints = async ({ page, limit, skip, userId, keyword }) => {
  const { data, total } =
    await clubMemberRepo.getUserJoinedClubsWithPointsUsingFacet({
      page,
      limit,
      userId,
      keyword,
    });

  return {
    data: formatUserWallets(data),
    meta: generateMeta(page, limit, total),
  };
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

const getCompanyProfileWithLoyaltyInfo = async (
  timezone,
  userId,
  companyOrganizer
) => {
  const [
    profile,
    userCompanyWallet,
    rewardsResponse,
    challenges,
    promotions,
    transactions,
  ] = await Promise.all([
    clubMemberRepo.getCompanyLoyaltyProfile(companyOrganizer),
    clubMemberRepo.isClubMemberWithWallet(userId, companyOrganizer),

    // ✅ rewards already tiered + normalized inside service
    getRewardsByCompanyOrganizerService({
      companyOrganizer,
      userId,
    }),

    getEligibleChallengesForLoyaltyPage({
      page: 1,
      limit: 10,
      timezone,
      companyOrganizer,
      userId,
    }),

    getPromotionsByCompanyOrganizerService({
      userId,
      page: 1,
      limit: 10,
      timezone,
      companyOrganizer,
    }),

    getRecentTransactionsForDashboard({
      limit: 5,
      user: userId,
      walletType: "companyLoyalty",
      companyOrganizer,
    }),
  ]);

  const formattedLoyaltyProfile =
    formatLoyaltyProfile(profile?.companyDetails);

  // fire-and-forget engagement log
  void logEngagementService({
    entityType: "users",
    entityId: companyOrganizer,
    action: "view",
    userId,
  }).catch(console.error);

  return {
    profile: formattedLoyaltyProfile,
    userCompanyWallet: formatUserWallet(userCompanyWallet),

    // ✅ NO tier formatting, NO eligibility logic here
    rewards: rewardsResponse?.rewards || [],

    challenges,
    promotions: {
      items: promotions.promotions,
      meta: promotions.meta,
    },
    transactions,
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
