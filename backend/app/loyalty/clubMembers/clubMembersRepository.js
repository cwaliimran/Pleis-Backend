const { ClubMembers } = require("@ClubMembersModel");
const { UserCompanyLoyaltyWalletTransactions } = require("@UserCompanyLoyaltyWalletTransactionsModel");
const mongoose = require("mongoose");
const TierRepo = require("../../../admin/tiers/tiersRepository");
const Tiers = require("../../../admin/tiers/Tiers");
const { User } = require("@UserModel");

//
// Utility: Get tier key (essential, preferred, premier)
//
const getCompanyLoyaltyInfo = async (companyId) => {
  const company = await User.findById(companyId).select("companyDetails.loyaltySettings.model companyDetails.loyaltySettings.pointValuePercentage");
  let tierKey = company?.companyDetails?.loyaltySettings?.model || "essential";
  let pointValuePercentage = company?.companyDetails?.loyaltySettings?.pointValuePercentage || 0;
  return { tierKey, pointValuePercentage };
};

//
// Create or get member wallet (ClubMembers IS wallet now)
//
const ensureClubMemberWallet = async (userId, company) => {
  let member = await ClubMembers.findOne({ user: userId, companyOrganizer: company });

  const { tierKey, pointValuePercentage } = await getCompanyLoyaltyInfo(company);


  if (!member) {
    const defaultTier = await TierRepo.getFirstTier(tierKey);
    member = await ClubMembers.create({
      user: userId,
      companyOrganizer: company,
      tierKey,
      pointValuePercentage,
      points: 0,
      lifetimePoints: 0,
      level: defaultTier?._id || null,
      lastEvaluated: Date.now(),
    });
  }

  return member;
};

//
// Promotion logic
//
const checkPromotion = async (userId, company, tierKey) => {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const agg = await UserCompanyLoyaltyWalletTransactions.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        companyOrganizer: new mongoose.Types.ObjectId(company),
        type: "earn",
        createdAt: { $gte: oneYearAgo }
      }
    },
    { $group: { _id: null, total: { $sum: "$points.total" } } }
  ]);

  const earned12Months = agg.length ? agg[0].total : 0;

  const member = await ClubMembers.findOne({ user: userId, companyOrganizer: company }).populate("level");
  if (!member || !member.level) {
    return;
  }

  const currentLevel = member.level;
  const currentEntryPoints = currentLevel[tierKey]?.entryPoints || 0;

  const higherTiers = await Tiers.find({
    [`${tierKey}.entryPoints`]: { $gt: currentEntryPoints }
  }).sort({ [`${tierKey}.entryPoints`]: 1 });

  let selected = null;
  for (const tier of higherTiers) {
    if (earned12Months >= tier[tierKey].entryPoints) {
      selected = tier;
    }
  }

  if (!selected) {
    return;
  }

  await ClubMembers.updateOne(
    { user: userId, companyOrganizer: company },
    {
      $set: {
        level: selected._id,
        lastEvaluated: new Date(),
      }
    }
  );

  return { promoted: true, newLevel: selected };
};

//
// Demotion logic
//
const checkDemotion = async (userId, company, tierKey) => {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const agg = await UserCompanyLoyaltyWalletTransactions.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        companyOrganizer: new mongoose.Types.ObjectId(company),
        type: "earn",
        createdAt: { $gte: oneYearAgo }
      }
    },
    { $group: { _id: null, total: { $sum: "$points.total" } } }
  ]);

  const earned12Months = agg.length ? agg[0].total : 0;

  const member = await ClubMembers.findOne({ user: userId, companyOrganizer: company }).populate("level");
  if (!member || !member.level) {
    return;
  }

  const currentLevel = member.level;
  const retainNeeded = currentLevel[tierKey]?.retainPoints || 0;

  if (earned12Months >= retainNeeded) {
    return;
  }

  const fallbackTier = await TierRepo.getPreviousTierByRetainPoints(tierKey, earned12Months);
  if (!fallbackTier || fallbackTier._id.toString() === currentLevel._id.toString()) {
    return;
  }

  await ClubMembers.updateOne(
    { user: userId, companyOrganizer: company },
    {
      $set: {
        level: fallbackTier._id,
        lastEvaluated: Date.now(),
      }
    }
  );

  return { demoted: true, newLevel: fallbackTier };
};

//
// Update points (earn/spend)
//
const updatePoints = async ({
  userId,
  company,
  companyPoints,
  organization,
  allowNegative = false,
  objectId,
  objectType,
  type = "earn",
  description = ""
}) => {
  const { tierKey, pointValuePercentage } = await getCompanyLoyaltyInfo(company);

  let member = await ensureClubMemberWallet(userId, company);

  console.log("companyPoints",companyPoints)
  const pointsDelta = companyPoints.total;


  const newBalance = member.points + pointsDelta;
  if (!allowNegative && newBalance < 0) {
    throw new Error("Insufficient company loyalty points.");
  }

  member.points = newBalance;
  if (pointsDelta > 0) member.lifetimePoints += pointsDelta;

  await member.save();

  // Transaction
  await UserCompanyLoyaltyWalletTransactions.create({
    user: userId,
    companyOrganizer: company,
    organization,
    type, // earn, redeem, adjustment
    description,
    points: companyPoints,
    closingBalance: newBalance,
    objectId,
    objectType,
    source: "company_loyalty"
  });

  // Promotion / Demotion
  await checkPromotion(userId, company, tierKey);
  await checkDemotion(userId, company, tierKey);

  return getWallet(userId, company);
};

//
// Get wallet (ClubMembers is wallet)
//
const getWallet = async (userId, company) => {
  const { tierKey, pointValuePercentage } = await getCompanyLoyaltyInfo(company);

  let wallet = await ClubMembers.findOne({
    user: userId,
    companyOrganizer: company
  }).populate("level");

  if (!wallet) {
    await ensureClubMemberWallet(userId, company);
    return getWallet(userId, company);
  }

  // Attach next tier
  if (wallet.level) {
    const currentPoints = wallet.level[tierKey]?.entryPoints || 0;
    const nextTier = await TierRepo.getNextTier(tierKey, currentPoints);

    wallet = wallet.toObject();
    wallet.nextTier = nextTier || null;
  }

  return wallet;
};

//
// Join/Leave
//
const joinClub = async (userId, company) => {
  const existingMember = await ClubMembers.findOne({ user: userId, companyOrganizer: company });

  if (existingMember) {
    if (existingMember.status === "banned") {
      throw new Error("You are banned from this club.");
    }
    if (existingMember.status === "left") {
      existingMember.status = "active";
      await existingMember.save();
      await ensureClubMemberWallet(userId, company);
      return existingMember;
    }
    // Already a member (active or other status)
    return existingMember;
  }

  // const newMember = await ClubMembers.create({
  //   user: userId,
  //   companyOrganizer: company,
  // });

  let member = await ensureClubMemberWallet(userId, company);

  return member;
};

const leaveClub = async (userId, company) => {
  return ClubMembers.findOneAndUpdate(
    { user: userId, companyOrganizer: company },
    { status: "left" },
    { new: true }
  );
};

//
// Query utility
//
const isClubMember = async (userId, company) => {
  return !!(await ClubMembers.findOne({
    user: userId,
    companyOrganizer: company,
    status: "active",
  }));
};

const countClubMembers = async (query = {}) => {
  return ClubMembers.countDocuments(query);
};

const findClubMemberById = async (id) => {
  return ClubMembers.findById(id)
    .populate("user companyOrganizer level");
};

const getUserJoinedClubs = async (userId) => {
  return ClubMembers.find({ user: userId, status: { $ne: "left" } })
    .select("companyOrganizer");
};
const getUserJoinedClubsWithPoints = async (userId) => {
  const clubs = await ClubMembers.find({ user: userId, status: { $ne: "left" } })
    .populate([
      { path: "companyOrganizer", select: "profileIcon companyDetails.loyaltySettings.title" },
      { path: "level" }
    ])
    .lean();

  return clubs
};


//update tierKey and pointValuePercentage when company loyalty settings change
const updateCompanyLoyaltySettings = async (companyOrganizer, tierKey, pointValuePercentage) => {
  await ClubMembers.updateMany(
    { companyOrganizer },
    {
      $set: {
        tierKey,
        pointValuePercentage
      }
    }
  );
};

module.exports = {
  joinClub,
  leaveClub,
  updatePoints,
  getWallet,
  isClubMember,
  countClubMembers,
  findClubMemberById,
  getUserJoinedClubs,
  getUserJoinedClubsWithPoints,
  getCompanyLoyaltyInfo,
  updateCompanyLoyaltySettings
};
