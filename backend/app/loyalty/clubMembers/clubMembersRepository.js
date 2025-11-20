const {
  ClubMembers,
} = require("@ClubMembersModel");

// Count
const countClubMembers = async (query = {}) => {
  return ClubMembers.countDocuments(query);
};

// Find by ID with population
const findClubMemberById = async (id) => {
  return ClubMembers.findById(id)
    .populate({
      path: "user",
      select: "firstName lastName username profileIcon"
    })
    .populate({
      path: "companyOrganizer",
      select: "firstName lastName username profileIcon"
    });
};

const joinClub = async (userId, companyOrganizer) => {
  // Check if user is banned
  const bannedMember = await ClubMembers.findOne({
    user: userId,
    companyOrganizer,
    status: "banned",
  });
  if (bannedMember) {
    throw new Error("User is banned from this club.");
  }

  // Try to find a member with status "left"
  const existingMember = await ClubMembers.findOne({
    user: userId,
    companyOrganizer,
    status: "left",
  });

  if (existingMember) {
    // Reactivate the member
    existingMember.status = "active";
    return existingMember.save();
  } else {
    // Create a new member (will throw if duplicate and not "left" or "banned")
    const newMember = new ClubMembers({
      user: userId,
      companyOrganizer,
    });
    return newMember.save();
  }
};

//leave club
const leaveClub = async (userId, companyOrganizer) => {
  return ClubMembers.findOneAndUpdate(
    {
      user: userId,
      companyOrganizer,
    },
    {
      status: "left",
    },
    { new: true }
  );
};

//is club member
const isClubMember = async (userId, companyOrganizer) => {
  const member = await ClubMembers.findOne({
    user: userId,
    companyOrganizer,
    status: "active",
  });
  return !!member;
};

//get user joined clubs
const getUserJoinedClubs = async (userId) => {
  return ClubMembers.find({ user: userId, status: { $ne: "left" } }).select("companyOrganizer");
};

module.exports = {
  countClubMembers,
  findClubMemberById,
  joinClub,
  leaveClub,
  isClubMember,
  getUserJoinedClubs,
};