const clubMemberRepo = require("./clubMembersRepository");
const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const { ClubMembers } = require("@ClubMembersModel");
const { buildKeywordQueryFromModels } = require("../../../helperUtils/dbUtils/queryUtil");
const formatClubMembers = require("./formatter/formatClubMembers");

//count members

const countClubMembers = async (filters = {}) => {
  return await clubMemberRepo.countClubMembers(filters);
};

const getClubMemberDetails = async (id) => {
  return await clubMemberRepo.findClubMemberById(id).populate('user companyOrganizer');
};

// getMembers
const getMembers = async (page,
  limit,
  keyword,
  status,
  companyOrganizer,
  date) => {

  let { members,
    meta } = await clubMemberRepo.getMembers(page,
      limit,
      keyword,
      status,
      companyOrganizer,
      date);

  const formattedMembers = members.map(member => {
    return formatClubMembers(member)
  })
  return { members: formattedMembers, meta };
};
// giftPoints
const giftPoints = async (userId, points, companyOrganizer) => {
  return true;
  // return await clubMemberRepo.giftPoints(userId, companyOrganizer);
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
  getMembers,
  giftPoints,
  isClubMember,
  getUserJoinedClubs
};