const clubMemberRepo = require("./clubMembersRepository");
const { formatUserWallet, formatUserWallets } = require("./formatters/formatUserWallet");

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
  let wallet= await clubMemberRepo.getWallet(userId, companyOrganizer);
  return formatUserWallet(wallet);
};

// 🔥 NEW: Update Points & auto promotion/demotion
const updateUserCompanyPoints = async (payload) => {
  let wallet = await clubMemberRepo.updatePoints(payload);
  return formatUserWallet(wallet);
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
};
