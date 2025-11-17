const clubMemberRepo = require("./clubMembersRepository");
const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const { ClubMembers } = require("@ClubMembersModel");
const { buildKeywordQueryFromModels } = require("../../../helperUtils/dbUtils/queryUtil");

//count members

const countClubMembers = async (filters = {}) => {
  return await clubMemberRepo.countClubMembers(filters);
};

const getClubMemberDetails = async (id) => {
  return await clubMemberRepo.findClubMemberById(id).populate('user companyOrganizer');
};

// joinClub,

const joinClub = async (userId, companyOrganizer) => {
  return await clubMemberRepo.joinClub(userId, companyOrganizer);
};
// leaveClub,

const leaveClub = async (userId, companyOrganizer) => {
  return await clubMemberRepo.leaveClub(userId, companyOrganizer);
};

const isClubMember = async (userId, companyOrganizer) => {
  return await clubMemberRepo.isClubMember(userId, companyOrganizer);
};

//get user joined clubs
const getUserJoinedClubs = async (userId) => {
  return await clubMemberRepo.getUserJoinedClubs(userId);
};


module.exports = {
  countClubMembers,
  getClubMemberDetails,
  joinClub,
  leaveClub,

  getUserJoinedClubs
};