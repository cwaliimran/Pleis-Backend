const clubMemberRepo = require("./clubMembersRepository");
const {
  generateMeta,
  getCurrentDateInTimezone,
} = require("@utils/responseUtil");
const { ClubMembers } = require("@ClubMembersModel");
const {
  buildKeywordQueryFromModels,
} = require("../../../helperUtils/dbUtils/queryUtil");
const formatClubMembers = require("./formatter/formatClubMembers");
const {
  giftPoints,
} = require("../../../admin/loyalty/clubMembers/clubMembersRepository.js");
//count members

const countClubMembers = async (filters = {}) => {
  return await clubMemberRepo.countClubMembers(filters);
};

const getClubMemberDetails = async (id) => {
  return await clubMemberRepo
    .findClubMemberById(id)
    .populate("user companyOrganizer");
};

// getMembers
const getMembers = async (
  page,
  limit,
  keyword,
  status,
  companyOrganizer,
  date,
) => {
  let { members, meta } = await clubMemberRepo.getMembers(
    page,
    limit,
    keyword,
    status,
    companyOrganizer,
    date,
  );

  const formattedMembers = members.map((member) => {
    return formatClubMembers(member);
  });
  return { members: formattedMembers, meta };
};

const isClubMember = async (userId, companyOrganizer) => {
  return await clubMemberRepo.isClubMember(userId, companyOrganizer);
};

//get user joined clubs
const getUserJoinedClubs = async (userId) => {
  return await clubMemberRepo.getUserJoinedClubs(userId);
};

const awardPointsAndUpdateMemberLevel = async ({ user, loyalty, globalLoyalty }) => {
  const applied = [];

  if (loyalty?.points > 0) {
    const res = await giftPoints(  loyalty.companyOrganizer,user,loyalty.points,);
    if (res.error) throw new Error(res.error.message);
    applied.push("loyalty_points_gifted");
  }

  if (loyalty?.tier) {
    const res = await clubMemberRepo.updateMemberTier(
      user,
      loyalty.companyOrganizer,
      loyalty.tier
    );
    if (res.error) throw new Error(res.error.message);
    applied.push("loyalty_tier_updated");
  }

  if (globalLoyalty?.points > 0) {
    const res = await clubMemberRepo.giftPointsGlobalLoyalty(user, globalLoyalty.points);
    if (res.error) throw new Error(res.error.message);
    applied.push("global_points_gifted");
  }

  if (globalLoyalty?.status) {
    const res = await clubMemberRepo.updateGlobalMemberTier(user, globalLoyalty.status);
    if (res.error) throw new Error(res.error.message);
    applied.push("global_status_updated");
  }

  if (!applied.length) {
    return { error: true, message: "No loyalty or global loyalty changes" };
  }

  return { error: false, applied };
};

module.exports = {
  countClubMembers,
  getClubMemberDetails,
  getMembers,
  isClubMember,
  getUserJoinedClubs,
  awardPointsAndUpdateMemberLevel,
};
